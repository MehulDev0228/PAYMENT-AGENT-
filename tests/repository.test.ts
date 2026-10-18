import { PGlite, type PGliteInterface } from "@electric-sql/pglite";
import readXlsxFile from "read-excel-file/node";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, createCompany, seedDemo } from "@/lib/data/db-setup";
import { createMockRepository } from "@/lib/data/mock-repository";
import { businessNow, createPostgresRepository } from "@/lib/data/postgres-repository";
import type { AeraRepository } from "@/lib/data/repository";
import { DEMO_COMPANY_ID, DEMO_NOW } from "@/lib/data/seed";
import type { SqlClient, SqlDatabase } from "@/lib/data/sql";
import { upsertWorkspaceUser } from "@/lib/data/users";
import { buildReport, toCsv, toXlsx } from "@/lib/exports";

const C = DEMO_COMPANY_ID;
const OTHER_COMPANY = "00000000-0000-0000-0000-0000000000aa";
const USER = "user-demo-manager";
const TODAY = "2026-09-27";

/** Workspace users each adapter knows: the mock's seed collectors, or rows provisioned in public.users. */
interface People { collector: string; collectorName: string; other: string; outsider: string }
const MOCK_PEOPLE: People = { collector: "user-demo-priya", collectorName: "Priya Nair", other: "user-demo-arjun", outsider: "user-not-in-workspace" };
const PG_PEOPLE: People = { collector: "aaaaaaaa-0000-4000-8000-000000000001", collectorName: "Asha Collector", other: "aaaaaaaa-0000-4000-8000-000000000002", outsider: "aaaaaaaa-0000-4000-8000-0000000000ff" };

function pgliteDatabase(pg: PGliteInterface): SqlDatabase {
  const client = (target: Pick<PGliteInterface, "query" | "exec">): SqlClient => ({
    query: async <R,>(text: string, params?: unknown[]) => (await target.query<R>(text, params)).rows,
    exec: async (text) => { await target.exec(text); },
  });
  return { ...client(pg), transaction: (fn) => pg.transaction((tx) => fn(client(tx))) };
}

// Embedded PostgreSQL: migrated and seeded once, then cloned so every test starts from the same state.
let template: PGliteInterface;
beforeAll(async () => {
  template = await PGlite.create({ extensions: { pgcrypto } });
  const db = pgliteDatabase(template);
  await applyMigrations(db);
  await seedDemo(db);
  await createCompany(db, { id: OTHER_COMPANY, name: "Unrelated tenant" });
  const provision = async (id: string, companyId: string, name: string) => {
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await upsertWorkspaceUser(db, { id, companyId, name, email: `${id.slice(-4)}@example.test`, role: "collection_manager" });
  };
  await provision(PG_PEOPLE.collector, C, PG_PEOPLE.collectorName);
  await provision(PG_PEOPLE.other, C, "Ravi Second");
  // A real user, but of another company: must never own this company's cases.
  await provision(PG_PEOPLE.outsider, OTHER_COMPANY, "Olga Outsider");
}, 120_000);
afterAll(async () => { await template?.close(); });

async function freshPostgres() {
  const db = pgliteDatabase(await template.clone());
  return { db, repo: createPostgresRepository(db, { now: () => DEMO_NOW }) };
}

const adapters: Array<[string, () => Promise<AeraRepository>, People]> = [
  ["mock", async () => createMockRepository(), MOCK_PEOPLE],
  ["postgres", async () => (await freshPostgres()).repo, PG_PEOPLE],
];

describe.each(adapters)("%s repository", (_name, make, people) => {
  let repo: AeraRepository;
  beforeEach(async () => { repo = await make(); });

  const caseFor = async (invoiceNumber: string) => (await repo.listCases(C, { q: invoiceNumber })).find((item) => item.invoice.invoiceNumber === invoiceNumber)!;

  describe("acceptance scenario: INV-1042", () => {
    it("starts with an active promise for 29 September", async () => {
      const item = await caseFor("INV-1042");
      expect(item.status).toBe("payment_promised");
      expect(item.activePromise?.promisedDate).toBe("2026-09-29");
      expect(item.invoice.amountOutstanding).toBe(84_000);
    });

    it("closes the case and fulfils the promise when the payment is imported", async () => {
      const result = await repo.importPayments(C, [{ payment_reference: "UTR-ACCEPT-1", invoice_number: "INV-1042", amount: 84_000, payment_date: "2026-09-29" }]);
      expect(result).toMatchObject({ imported: 1, rejected: 0 });
      const item = (await repo.getCase(C, (await caseFor("INV-1042")).id))!;
      expect(item.status).toBe("closed");
      expect(item.invoice.status).toBe("paid");
      expect(item.promises.find((p) => p.promisedDate === "2026-09-29")?.status).toBe("fulfilled");
      expect((await repo.listAudit(C, { entityId: item.id })).some((e) => e.eventType === "case_status_changed" && e.dataSnapshot.to === "closed")).toBe(true);
    });

    it("rejects a duplicate payment reference", async () => {
      const row = { payment_reference: "UTR-DUP", invoice_number: "INV-1042", amount: 1000, payment_date: "2026-09-29" };
      await repo.importPayments(C, [row]);
      expect(await repo.importPayments(C, [row])).toMatchObject({ imported: 0, rejected: 1 });
    });

    it("keeps the case open on a partial payment", async () => {
      await repo.importPayments(C, [{ payment_reference: "UTR-PART", invoice_number: "INV-1042", amount: 4_000, payment_date: "2026-09-29" }]);
      const item = await caseFor("INV-1042");
      expect(item.status).toBe("payment_promised");
      expect(item.invoice.amountOutstanding).toBe(80_000);
    });
  });

  describe("customer replies", () => {
    const reply = async (body: string, id: string, invoiceNumber: string) => {
      const item = await caseFor(invoiceNumber);
      return { from: item.customer.email, subject: `Re: ${invoiceNumber}`, body, externalMessageId: id };
    };
    const promise = { intent: "payment_promise" as const, promised_date: "2026-10-02", promised_amount: null, confidence: 0.93, requires_human: false };

    it("records a promise from a promise reply", async () => {
      const target = (await repo.listCases(C, { statuses: ["reminder_sent"] }))[0];
      const result = await repo.recordReply(C, await reply("We will pay on 2026-10-02.", "m-1", target.invoice.invoiceNumber), promise);
      expect(result.promiseId).toBeDefined();
      expect((await caseFor(target.invoice.invoiceNumber)).status).toBe("payment_promised");
    });

    it("raises an approval for a payment plan request", async () => {
      const target = (await repo.listCases(C, { statuses: ["reminder_sent"] }))[1];
      const result = await repo.recordReply(C, await reply("Can we pay 50% now and the rest next month?", "m-2", target.invoice.invoiceNumber), { intent: "payment_plan_request", promised_date: null, promised_amount: null, confidence: 0.98, requires_human: true });
      expect(result.requiresHuman).toBe(true);
      expect((await repo.listApprovals(C)).some((a) => a.id === result.approvalActionId)).toBe(true);
      expect((await caseFor(target.invoice.invoiceNumber)).status).toBe("escalated");
    });

    it("is idempotent on the external message id", async () => {
      const target = (await repo.listCases(C, { statuses: ["reminder_sent"] }))[2];
      const input = await reply("We will pay on 2026-10-02.", "m-3", target.invoice.invoiceNumber);
      await repo.recordReply(C, input, promise);
      const promisesBefore = (await repo.listPromises(C)).length;
      expect((await repo.recordReply(C, input, promise)).duplicate).toBe(true);
      expect((await repo.listPromises(C)).length).toBe(promisesBefore);
    });

    it("keeps a reply from an unknown sender for manual triage", async () => {
      const result = await repo.recordReply(C, { from: "stranger@nowhere.example", subject: "Hello", body: "Who is this?", externalMessageId: "m-4" }, { intent: "general_reply", promised_date: null, promised_amount: null, confidence: 0.9, requires_human: false });
      expect(result.caseId).toBeUndefined();
      expect((await repo.listAudit(C, { entityType: "communication" }))[0]?.eventType).toBe("reply_unmatched");
    });
  });

  describe("payment review", () => {
    it("lists candidates and applies a manual match", async () => {
      const [pending] = await repo.listPayments(C, "payment_match_review_required");
      const target = (await repo.paymentCandidates(C, pending.id)).find((c) => c.invoice.invoiceNumber === "INV-1042")!;
      expect(target).toBeDefined();
      await repo.resolvePayment(C, pending.id, target.invoice.id, USER);
      expect(await repo.listPayments(C, "payment_match_review_required")).toHaveLength(0);
      expect((await caseFor("INV-1042")).status).toBe("closed");
      await expect(repo.resolvePayment(C, pending.id, target.invoice.id, USER)).rejects.toThrow(/already matched/);
    });
  });

  describe("approvals and automation", () => {
    it("records the human decision and refuses a second decision", async () => {
      const [approval] = await repo.listApprovals(C);
      await repo.decideAction(C, approval.id, "approved", USER);
      expect((await repo.listAudit(C, { entityId: approval.id }))[0]).toMatchObject({ actorType: "human", eventType: "action_approved" });
      await expect(repo.decideAction(C, approval.id, "rejected", USER)).rejects.toThrow();
    });

    it("creates at most one action per invoice and policy step", async () => {
      await repo.runDailyMonitor(C);
      expect((await repo.runDailyMonitor(C)).created).toBe(0);
    });

    it("never stacks a second open decision on a case", async () => {
      await repo.runDailyMonitor(C);
      const open = await repo.listActions(C, "awaiting_approval");
      expect(new Set(open.map((action) => action.collectionCaseId)).size).toBe(open.length);
    });

    it("does not re-queue policy steps already handled in the seed", async () => {
      const seeded = (await repo.listActions(C)).filter((action) => action.createdBy === "aera" && action.dataSnapshot.policyStepId);
      expect(seeded.length).toBeGreaterThan(100);
      const created = (await repo.runDailyMonitor(C)).actions;
      expect(created.some((action) => seeded.some((s) => s.invoiceId === action.invoiceId && s.dataSnapshot.policyStepId === action.dataSnapshot.policyStepId))).toBe(false);
    });

    it("scopes every read to the company", async () => {
      expect(await repo.listCases(OTHER_COMPANY)).toHaveLength(0);
      expect((await repo.overview(OTHER_COMPANY)).totalOutstanding).toBe(0);
      expect(await repo.search(OTHER_COMPANY, "INV-1042")).toHaveLength(0);
    });
  });

  describe("case assignment", () => {
    it("lists the workspace users who can own cases", async () => {
      const users = await repo.listUsers(C);
      expect(users.map((user) => user.id)).toEqual(expect.arrayContaining([people.collector, people.other]));
      expect(users.some((user) => user.id === people.outsider)).toBe(false);
    });

    it("assigns a case, shows the owner's name and filters by owner", async () => {
      const target = await caseFor("INV-1042");
      await repo.assignCase(C, target.id, people.collector, USER);
      const item = await caseFor("INV-1042");
      expect(item).toMatchObject({ assignedTo: people.collector, assigneeName: people.collectorName });
      const mine = await repo.listCases(C, { assignedTo: people.collector });
      expect(mine.some((c) => c.id === target.id)).toBe(true);
      expect(mine.every((c) => c.assignedTo === people.collector)).toBe(true);
      expect((await repo.listCases(C, { assignedTo: people.other })).some((c) => c.id === target.id)).toBe(false);
    });

    it("audits every change and skips no-op reassignments", async () => {
      const target = await caseFor("INV-1042");
      const ownershipEvents = async () => (await repo.listAudit(C, { entityId: target.id })).filter((e) => e.eventType === "case_assigned" || e.eventType === "case_unassigned");
      await repo.assignCase(C, target.id, null, USER); // the seed may already give the case an owner
      const before = (await ownershipEvents()).length;
      await repo.assignCase(C, target.id, people.collector, USER);
      await repo.assignCase(C, target.id, people.collector, USER);
      await repo.assignCase(C, target.id, people.other, USER);
      await repo.assignCase(C, target.id, null, USER);
      const events = await ownershipEvents();
      expect(events).toHaveLength(before + 3);
      // Events written in the same millisecond have no defined order, so match them by content.
      expect(events.find((e) => e.eventType === "case_unassigned" && e.dataSnapshot.from === people.other)).toMatchObject({ actorType: "human", actorId: USER, dataSnapshot: { to: null } });
      expect(events.find((e) => e.dataSnapshot.to === people.other)?.reason).toContain(`was ${people.collectorName}`);
      const unassigned = await repo.listCases(C, { assignedTo: null });
      expect(unassigned.some((c) => c.id === target.id)).toBe(true);
      expect(unassigned.every((c) => !c.assignedTo)).toBe(true);
    });

    it("refuses users outside the workspace and unknown cases", async () => {
      const target = await caseFor("INV-1042");
      await expect(repo.assignCase(C, target.id, people.outsider, USER)).rejects.toThrow(/not a user in this workspace/);
      await expect(repo.assignCase(C, "00000000-0000-0000-0000-00000000dead", people.collector, USER)).rejects.toThrow(/not found/);
      await expect(repo.assignCase(OTHER_COMPANY, target.id, null, USER)).rejects.toThrow(/not found/);
    });
  });

  describe("follow-up log", () => {
    it("records a call, keeps it on the case and audits it", async () => {
      const target = await caseFor("INV-1042");
      const followUp = await repo.logFollowUp(C, target.id, { outcome: "promised", note: "  Promised NEFT on Tuesday  ", nextFollowUpDate: "2026-09-29" }, USER);
      expect(followUp).toMatchObject({ outcome: "promised", note: "Promised NEFT on Tuesday", nextFollowUpDate: "2026-09-29", createdBy: USER, collectionCaseId: target.id });
      const detail = (await repo.getCase(C, target.id))!;
      expect(detail.followUps[0]).toMatchObject({ id: followUp.id, outcome: "promised" });
      expect(detail.lastFollowUp?.id).toBe(followUp.id);
      const [event] = (await repo.listAudit(C, { entityId: target.id })).filter((e) => e.eventType === "follow_up_logged");
      expect(event).toMatchObject({ actorType: "human", actorId: USER, dataSnapshot: { followUpId: followUp.id, outcome: "promised", nextFollowUpDate: "2026-09-29" } });
    });

    it("lists follow-ups due today and drops them once a later call is logged", async () => {
      const target = await caseFor("INV-1042");
      await repo.logFollowUp(C, target.id, { outcome: "no_answer", nextFollowUpDate: TODAY }, USER);
      const due = (await repo.followUpsDue(C)).find((item) => item.case.id === target.id);
      expect(due).toMatchObject({ daysLate: 0, followUp: { outcome: "no_answer", nextFollowUpDate: TODAY } });
      await repo.logFollowUp(C, target.id, { outcome: "reached", note: "Call back Thursday", nextFollowUpDate: "2026-10-01" }, USER);
      expect((await repo.followUpsDue(C)).some((item) => item.case.id === target.id)).toBe(false);
    });

    it("drops a due follow-up when the case closes", async () => {
      const target = await caseFor("INV-1042");
      await repo.logFollowUp(C, target.id, { outcome: "promised", nextFollowUpDate: TODAY }, USER);
      await repo.importPayments(C, [{ payment_reference: "UTR-FOLLOWUP", invoice_number: "INV-1042", amount: 84_000, payment_date: TODAY }]);
      expect((await repo.followUpsDue(C)).some((item) => item.case.id === target.id)).toBe(false);
    });

    it("persists the log across reloads", async () => {
      const target = await caseFor("INV-1042");
      const followUp = await repo.logFollowUp(C, target.id, { outcome: "disputed", note: "Short delivery claimed" }, USER);
      const again = (await repo.getCase(C, target.id))!.followUps.find((item) => item.id === followUp.id);
      expect(again).toMatchObject({ outcome: "disputed", note: "Short delivery claimed" });
      expect(again?.nextFollowUpDate).toBeUndefined();
    });

    it("rejects bad input without writing anything", async () => {
      const target = await caseFor("INV-1042");
      const before = (await repo.getCase(C, target.id))!.followUps.length;
      await expect(repo.logFollowUp(C, target.id, { outcome: "angry" as never }, USER)).rejects.toThrow(/outcome/);
      await expect(repo.logFollowUp(C, target.id, { outcome: "reached", nextFollowUpDate: "2026-09-20" }, USER)).rejects.toThrow(/past/);
      await expect(repo.logFollowUp(C, target.id, { outcome: "reached", nextFollowUpDate: "2026-02-31" }, USER)).rejects.toThrow(/valid/);
      await expect(repo.logFollowUp(C, target.id, { outcome: "reached", note: "x".repeat(2001) }, USER)).rejects.toThrow(/limited/);
      await expect(repo.logFollowUp(OTHER_COMPANY, target.id, { outcome: "reached" }, USER)).rejects.toThrow(/not found/);
      expect((await repo.getCase(C, target.id))!.followUps).toHaveLength(before);
    });
  });

  describe("ageing and exports", () => {
    it("buckets every open balance and reconciles with the overview", async () => {
      const [report, overview] = await Promise.all([repo.ageingReport(C), repo.overview(C)]);
      expect(report.asOf).toBe(TODAY);
      expect(report.totals.total).toBe(overview.totalOutstanding);
      const { notDue, days1to30, days31to60, days61to90, days90plus, total } = report.totals;
      expect(notDue + days1to30 + days31to60 + days61to90 + days90plus).toBe(total);
      expect(report.rows.reduce((sum, row) => sum + row.total, 0)).toBe(total);
      expect(report.invoices).toHaveLength(report.totals.openInvoices);
      const inv1042 = report.invoices.find((item) => item.invoice.invoiceNumber === "INV-1042")!;
      expect(inv1042).toMatchObject({ daysOverdue: 7, bucket: "days1to30" });
      expect(await repo.ageingReport(OTHER_COMPANY)).toMatchObject({ rows: [], totals: { total: 0 } });
    });

    it("exports the filtered case view with owner and last call", async () => {
      const target = await caseFor("INV-1042");
      await repo.assignCase(C, target.id, people.collector, USER);
      await repo.logFollowUp(C, target.id, { outcome: "promised", note: "=HYPERLINK(\"x\")", nextFollowUpDate: "2026-09-29" }, USER);
      const { tables } = await buildReport(repo, C, people.collector, "cases", new URLSearchParams({ assignee: "me", q: "INV-1042", view: "promised" }));
      const [sheet] = tables;
      expect(sheet.rows).toHaveLength(1);
      const row = Object.fromEntries(sheet.columns.map((column, index) => [column.header, sheet.rows[0][index]]));
      expect(row).toMatchObject({ Invoice: "INV-1042", "Assigned to": people.collectorName, Outstanding: 84_000, "Last call outcome": "Promised to pay", "Next follow-up": "2026-09-29" });
      expect(toCsv(sheet)).toContain(`"'=HYPERLINK(""x"")"`);
      const other = await buildReport(repo, C, people.other, "cases", new URLSearchParams({ assignee: "me", q: "INV-1042" }));
      expect(other.tables[0].rows).toHaveLength(0);
    });

    it("writes the ageing workbook with a totals row and an invoice sheet", async () => {
      const { tables } = await buildReport(repo, C, USER, "ageing", new URLSearchParams());
      const sheets = await readXlsxFile(await toXlsx(tables));
      expect(sheets.map((sheet) => sheet.sheet)).toEqual([`Ageing ${TODAY}`, "Open invoices"]);
      const [summary, detail] = sheets;
      expect(summary.data[0]).toEqual(["Customer code", "Customer", "Region", "Account manager", "Not due", "1–30 days", "31–60 days", "61–90 days", "90+ days", "Total outstanding", "Open invoices"]);
      const totals = summary.data.at(-1)!;
      expect(totals[1]).toMatch(/^Total \(\d+ customers\)$/);
      expect(totals[9]).toBe((await repo.overview(C)).totalOutstanding);
      expect(detail.data.length - 1).toBe((await repo.ageingReport(C)).invoices.length);
      expect(detail.data[1][4]).toBeInstanceOf(Date);
    });

    it("exports customers and payments with the page filters", async () => {
      const customers = await buildReport(repo, C, USER, "customers", new URLSearchParams({ q: "CUS-0001" }));
      expect(customers.tables[0].rows.map((row) => row[0])).toEqual(["CUS-0001"]);
      const review = await buildReport(repo, C, USER, "payments", new URLSearchParams({ status: "payment_match_review_required" }));
      expect(review.tables[0].rows).toHaveLength((await repo.listPayments(C, "payment_match_review_required")).length);
      expect(review.tables[0].rows[0][3]).toBe("needs review");
    });
  });
});

describe("postgres adapter", () => {
  it("persists changes across repository instances", async () => {
    const { db, repo } = await freshPostgres();
    await repo.importPayments(C, [{ payment_reference: "UTR-PERSIST", invoice_number: "INV-1042", amount: 84_000, payment_date: "2026-09-29" }]);
    const restarted = createPostgresRepository(db, { now: () => DEMO_NOW, readCacheMs: 0 });
    const item = (await restarted.listCases(C, { q: "INV-1042" })).find((c) => c.invoice.invoiceNumber === "INV-1042")!;
    expect(item.status).toBe("closed");
    expect(item.invoice).toMatchObject({ amountPaid: 84_000, amountOutstanding: 0, status: "paid" });
    const [row] = await db.query<{ amount_paid: string }>("select amount_paid::text from public.invoices where company_id = $1 and invoice_number = 'INV-1042'", [C]);
    expect(Number(row.amount_paid)).toBe(84_000);
  });

  it("stores owners and follow-ups in their own columns and table", async () => {
    const { db, repo } = await freshPostgres();
    const target = (await repo.listCases(C, { q: "INV-1042" }))[0];
    expect(target.assignedTo).toBeUndefined(); // the demo seed has no provisioned collectors
    await repo.assignCase(C, target.id, PG_PEOPLE.collector, USER);
    await repo.logFollowUp(C, target.id, { outcome: "no_answer", note: "Line busy", nextFollowUpDate: "2026-09-28" }, USER);
    const [caseRow] = await db.query<{ assigned_to: string }>("select assigned_to from public.collection_cases where id = $1", [target.id]);
    expect(caseRow.assigned_to).toBe(PG_PEOPLE.collector);
    const rows = await db.query<{ outcome: string; note: string; next: string; created_by: string }>(
      "select outcome, note, next_follow_up_date::text as next, created_by from public.case_follow_ups where collection_case_id = $1", [target.id]);
    expect(rows).toEqual([{ outcome: "no_answer", note: "Line busy", next: "2026-09-28", created_by: USER }]);
  });

  it("serialises concurrent writers so a payment is applied once", async () => {
    const { repo } = await freshPostgres();
    const row = { payment_reference: "UTR-RACE", invoice_number: "INV-1042", amount: 84_000, payment_date: "2026-09-29" };
    const results = await Promise.all([repo.importPayments(C, [row]), repo.importPayments(C, [row])]);
    expect(results.map((r) => r.imported).sort()).toEqual([0, 1]);
    expect((await repo.getInvoice(C, (await repo.listCases(C, { q: "INV-1042" }))[0].invoiceId))?.amountPaid).toBe(84_000);
  });

  it("rolls back every change when a write fails", async () => {
    const { db, repo } = await freshPostgres();
    const before = await db.query("select count(*)::int as n from public.audit_events");
    await expect(repo.decideAction(C, "00000000-0000-0000-0000-00000000dead", "approved", USER)).rejects.toThrow(/not found/);
    expect(await db.query("select count(*)::int as n from public.audit_events")).toEqual(before);
  });

  it("reports an unknown company instead of returning empty data", async () => {
    const { repo } = await freshPostgres();
    await expect(repo.overview("00000000-0000-0000-0000-00000000beef")).rejects.toThrow(/not found/);
  });

  it("uses the company's calendar date", () => {
    expect(businessNow("Asia/Kolkata", new Date("2026-10-15T20:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-16");
    expect(businessNow("UTC", new Date("2026-10-15T20:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-15");
  });
});

import { PGlite, type PGliteInterface } from "@electric-sql/pglite";
import readXlsxFile from "read-excel-file/node";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, createCompany, seedDemo } from "@/lib/data/db-setup";
import { createMockRepository } from "@/lib/data/mock-repository";
import { businessNow, createPostgresRepository } from "@/lib/data/postgres-repository";
import { companyScope, withRegion, type AeraRepository, type DataScope, type InvoiceImportRow } from "@/lib/data/repository";
import { DEMO_COMPANY_ID, DEMO_NOW } from "@/lib/data/seed";
import type { SqlClient, SqlDatabase } from "@/lib/data/sql";
import { upsertWorkspaceUser } from "@/lib/data/users";
import type { RegionSummary } from "@/lib/domain/types";
import { buildReport, toCsv, toXlsx } from "@/lib/exports";

const C = companyScope(DEMO_COMPANY_ID);
const OTHER_COMPANY = "00000000-0000-0000-0000-0000000000aa";
const OTHER = companyScope(OTHER_COMPANY);
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
  await provision(PG_PEOPLE.collector, C.companyId, PG_PEOPLE.collectorName);
  await provision(PG_PEOPLE.other, C.companyId, "Ravi Second");
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
      expect(await repo.listCases(OTHER)).toHaveLength(0);
      expect((await repo.overview(OTHER)).totalOutstanding).toBe(0);
      expect(await repo.search(OTHER, "INV-1042")).toHaveLength(0);
    });
  });

  describe("regions", () => {
    const NORTH: DataScope = { companyId: DEMO_COMPANY_ID, regions: ["North"] };
    const regionMap = async () => new Map((await repo.listCustomers(C)).map((customer) => [customer.id, customer.region]));
    const southCustomer = async () => (await repo.listCustomers(C)).find((customer) => customer.region === "South")!;
    const approvalIn = async (region: string) => {
      const regions = await regionMap();
      return (await repo.listApprovals(C)).find((approval) => regions.get(approval.customerId) === region)!;
    };
    const invoiceRow = (overrides: Partial<InvoiceImportRow>): InvoiceImportRow => ({
      invoice_number: "INV-R-1", customer_name: "Region Test Ltd", customer_email: "ap@region-test.example", invoice_date: "2026-08-01", due_date: "2026-09-01", amount: 5_000, currency: "INR", ...overrides,
    });

    it("filters cases, customers, payments and promises by region", async () => {
      const regions = await regionMap();
      const north = withRegion(C, "North");
      const cases = await repo.listCases(north);
      expect(cases.length).toBeGreaterThan(0);
      expect(cases.every((item) => item.customer.region === "North")).toBe(true);
      expect(cases).toHaveLength((await repo.listCases(C)).filter((item) => item.customer.region === "North").length);
      const customers = await repo.listCustomers(north);
      expect(customers).toHaveLength([...regions.values()].filter((region) => region === "North").length);
      const payments = await repo.listPayments(north);
      expect(payments.length).toBeGreaterThan(0);
      expect(payments.every((payment) => regions.get(payment.customerId!) === "North")).toBe(true);
      const promises = await repo.listPromiseItems(north);
      expect(promises.length).toBeGreaterThan(0);
      expect(promises.every((promise) => regions.get(promise.customerId) === "North")).toBe(true);
      // Case and spacing do not matter; an unknown region shows nothing.
      expect(await repo.listCases(withRegion(C, "  nORTH "))).toHaveLength(cases.length);
      expect(await repo.listCases(withRegion(C, "Atlantis"))).toHaveLength(0);
      expect((await repo.overview(withRegion(C, "Atlantis"))).totalOutstanding).toBe(0);
    });

    it("summarises every region, adding up to the company total", async () => {
      const rows = await repo.regionSummary(C);
      expect(rows.map((row) => row.region)).toEqual(["Central", "East", "North", "South", "West"]);
      const total = await repo.overview(C);
      const add = (pick: (row: RegionSummary) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
      expect(add((row) => row.totalOutstanding)).toBeCloseTo(total.totalOutstanding, 2);
      expect(add((row) => row.totalOverdue)).toBeCloseTo(total.totalOverdue, 2);
      expect(add((row) => row.collectedThisMonth)).toBeCloseTo(total.collectedThisMonth, 2);
      total.aging.forEach((bucket, index) => expect(add((row) => row.aging[index].amount)).toBeCloseTo(bucket.amount, 2));
      expect(add((row) => row.customerCount)).toBe((await repo.listCustomers(C)).length);
      expect(add((row) => row.promisesDueCount)).toBeGreaterThan(0);
      const north = rows.find((row) => row.region === "North")!;
      expect(north).toMatchObject(await repo.overview(withRegion(C, "North")));
      expect((await repo.regionSummary(NORTH)).map((row) => row.region)).toEqual(["North"]);
      expect(await repo.regions(NORTH)).toEqual(["North"]);
    });

    it("hides another region's case, invoice, customer and payment from a regional user", async () => {
      const regions = await regionMap();
      const southCase = (await repo.listCases(C)).find((item) => item.customer.region === "South")!;
      expect(await repo.getCase(NORTH, southCase.id)).toBeUndefined();
      expect(await repo.getInvoice(NORTH, southCase.invoiceId)).toBeUndefined();
      expect(await repo.getCustomer(NORTH, southCase.customerId)).toBeUndefined();
      expect(await repo.getCustomerDetail(NORTH, southCase.customerId)).toBeUndefined();
      expect((await repo.listCases(NORTH)).some((item) => item.customer.region !== "North")).toBe(false);
      expect(await repo.search(NORTH, southCase.invoice.invoiceNumber)).toHaveLength(0);
      expect(await repo.search(C, southCase.invoice.invoiceNumber)).not.toHaveLength(0);
      const southPayment = (await repo.listPayments(C, "matched")).find((payment) => regions.get(payment.customerId!) === "South")!;
      expect((await repo.listPayments(NORTH)).some((payment) => payment.id === southPayment.id)).toBe(false);
      // A payment not tied to a customer belongs to no region.
      const [review] = await repo.listPayments(C, "payment_match_review_required");
      expect(await repo.listPayments(NORTH, "payment_match_review_required")).toHaveLength(0);
      await expect(repo.paymentCandidates(NORTH, review.id)).rejects.toThrow(/not found/);
      // The overview is the region's own.
      expect((await repo.overview(NORTH)).totalOutstanding).toBeCloseTo((await repo.overview(withRegion(C, "North"))).totalOutstanding, 2);
    });

    it("hides another region's audit trail and company-wide events", async () => {
      const south = await approvalIn("South");
      await repo.decideAction(C, south.id, "approved", USER);
      expect(await repo.listAudit(C, { entityId: south.id })).not.toHaveLength(0);
      expect(await repo.listAudit(NORTH, { entityId: south.id })).toHaveLength(0);
      await repo.runDailyMonitor(C);
      const feed = await repo.listAudit(NORTH, { limit: 200 });
      expect(feed.length).toBeGreaterThan(0);
      expect(feed.some((event) => event.entityId === south.id || event.entityType === "automation" || event.entityType === "import")).toBe(false);
    });

    it("stops a regional user from changing another region's case, invoice or payment", async () => {
      const south = await approvalIn("South");
      await expect(repo.decideAction(NORTH, south.id, "approved", USER)).rejects.toThrow(/not found/);
      await expect(repo.markActionExecuted(NORTH, south.id, { subject: "s", body: "b" })).rejects.toThrow(/not found/);
      expect((await repo.listApprovals(C)).find((item) => item.id === south.id)?.status).toBe("awaiting_approval");

      const [review] = await repo.listPayments(C, "payment_match_review_required");
      const target = (await repo.paymentCandidates(C, review.id))[0];
      await expect(repo.resolvePayment(NORTH, review.id, target.invoice.id, USER)).rejects.toThrow(/not found/);
      expect((await repo.listPayments(C, "payment_match_review_required")).map((payment) => payment.id)).toContain(review.id);

      const customer = await southCustomer();
      const before = (await repo.getCustomerDetail(C, customer.id))!.invoices.length;
      const result = await repo.importInvoices(NORTH, [
        invoiceRow({ invoice_number: "INV-R-SOUTH", customer_name: customer.name, customer_email: customer.email, customer_code: customer.customerCode }),
        invoiceRow({ invoice_number: "INV-R-WEST", region: "West" }),
        invoiceRow({ invoice_number: "INV-R-NONE" }),
        invoiceRow({ invoice_number: "INV-R-NORTH", customer_email: "ap@north-new.example", region: "north" }),
      ], USER);
      expect(result).toMatchObject({ imported: 1, rejected: 3 });
      expect(result.errors.map((error) => error.message)).toEqual([
        "INV-R-SOUTH belongs to region South, outside your regions", "INV-R-WEST belongs to region West, outside your regions", "INV-R-NONE belongs to no region, outside your regions",
      ]);
      expect((await repo.getCustomerDetail(C, customer.id))!.invoices).toHaveLength(before);

      const payments = repo.importPayments(NORTH, [{ payment_reference: "UTR-REGION", invoice_number: "INV-1042", amount: 1, payment_date: "2026-09-27" }]);
      await expect(payments).rejects.toMatchObject({ status: 403 });
      expect((await repo.listPayments(C)).some((payment) => payment.paymentReference === "UTR-REGION")).toBe(false);
    });

    it("saves a regional user's changes inside their region", async () => {
      const north = await approvalIn("North");
      await repo.decideAction(NORTH, north.id, "approved", USER);
      expect((await repo.listApprovals(C, "decided")).find((item) => item.id === north.id)?.status).toBe("approved");

      await repo.importInvoices(NORTH, [invoiceRow({ invoice_number: "INV-R-NEW", customer_email: "ap@north-new.example", region: "North" })], USER);
      const run = await repo.runDailyMonitor(NORTH);
      const regions = await regionMap();
      expect(run.actions.length).toBeGreaterThan(0);
      expect(run.actions.every((action) => regions.get(action.customerId) === "North")).toBe(true);
      const opened = (await repo.listCases(C, { q: "INV-R-NEW" }))[0];
      expect(opened?.customer.region).toBe("North");
      const actions = new Set((await repo.listActions(C)).map((action) => action.id));
      expect(run.actions.every((action) => actions.has(action.id))).toBe(true);
    });

    it("keeps owners, follow-ups and exports inside a regional user's regions", async () => {
      const cases = await repo.listCases(C);
      const southCase = cases.find((item) => item.customer.region === "South")!;
      const northCase = cases.find((item) => item.customer.region === "North")!;
      await expect(repo.assignCase(NORTH, southCase.id, people.collector, USER)).rejects.toThrow(/not found/);
      await expect(repo.logFollowUp(NORTH, southCase.id, { outcome: "reached" }, USER)).rejects.toThrow(/not found/);
      expect((await repo.getCase(C, southCase.id))!.followUps).toHaveLength(0);

      await repo.assignCase(NORTH, northCase.id, people.collector, USER);
      await repo.logFollowUp(NORTH, northCase.id, { outcome: "no_answer", nextFollowUpDate: TODAY }, USER);
      const saved = (await repo.getCase(C, northCase.id))!;
      expect(saved.assignedTo).toBe(people.collector);
      expect(saved.followUps.map((item) => item.outcome)).toEqual(["no_answer"]);
      expect((await repo.followUpsDue(NORTH)).map((item) => item.case.id)).toContain(northCase.id);

      const exported = await buildReport(repo, NORTH, USER, "customers", new URLSearchParams());
      expect(exported.tables[0].rows.length).toBe((await repo.listCustomers(NORTH)).length);
      // ?region= can only narrow a regional user's export, never widen it.
      const widened = await buildReport(repo, NORTH, USER, "customers", new URLSearchParams({ region: "South" }));
      expect(widened.tables[0].rows).toHaveLength(0);
      const ageing = await buildReport(repo, C, USER, "ageing", new URLSearchParams({ region: "North" }));
      const customerRows = ageing.tables[0].rows.slice(0, -1); // the last row is the totals row
      expect(customerRows.length).toBeGreaterThan(0);
      expect(customerRows.every((row) => row[2] === "North")).toBe(true);
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
      await expect(repo.assignCase(OTHER, target.id, null, USER)).rejects.toThrow(/not found/);
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
      await expect(repo.logFollowUp(OTHER, target.id, { outcome: "reached" }, USER)).rejects.toThrow(/not found/);
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
      expect(await repo.ageingReport(OTHER)).toMatchObject({ rows: [], totals: { total: 0 } });
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
    const [row] = await db.query<{ amount_paid: string }>("select amount_paid::text from public.invoices where company_id = $1 and invoice_number = 'INV-1042'", [C.companyId]);
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
    await expect(repo.overview(companyScope("00000000-0000-0000-0000-00000000beef"))).rejects.toThrow(/not found/);
  });

  it("limits direct client access to the user's regions through RLS", async () => {
    const { db } = await freshPostgres();
    const NORTH_USER = "66666666-6666-4666-8666-666666666666";
    const ALL_USER = "77777777-7777-4777-8777-777777777777";
    for (const id of [NORTH_USER, ALL_USER]) await db.query("insert into auth.users (id) values ($1)", [id]);
    await upsertWorkspaceUser(db, { id: NORTH_USER, companyId: C.companyId, name: "Nita North", email: "nita@aera.example", role: "viewer", regions: ["North"] });
    await upsertWorkspaceUser(db, { id: ALL_USER, companyId: C.companyId, name: "Asha All", email: "asha@aera.example", role: "viewer" });
    await db.exec(`create role aera_client; grant usage on schema public, auth to aera_client; grant select on all tables in schema public to aera_client;`);
    const asClient = (userId: string) => db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, company_id: C.companyId })]);
      await tx.exec("set local role aera_client");
      const [row] = await tx.query<{ regions: string[] | null; invoices: number; cases: number; audit: number }>(
        `select (select array_agg(distinct region order by region) from public.customers) as regions, (select count(*)::int from public.invoices) as invoices,
                (select count(*)::int from public.collection_cases) as cases, (select count(*)::int from public.audit_events) as audit`);
      return row;
    });
    const [north] = await db.query<{ invoices: number; cases: number }>(
      `select (select count(*)::int from public.invoices i join public.customers c on c.id = i.customer_id where c.region = 'North') as invoices,
              (select count(*)::int from public.collection_cases k join public.customers c on c.id = k.customer_id where c.region = 'North') as cases`);
    expect(await asClient(NORTH_USER)).toEqual({ regions: ["North"], invoices: north.invoices, cases: north.cases, audit: 0 });
    const all = await asClient(ALL_USER);
    expect(all.regions).toEqual(["Central", "East", "North", "South", "West"]);
    expect(all.audit).toBeGreaterThan(0);
  });

  it("uses the company's calendar date", () => {
    expect(businessNow("Asia/Kolkata", new Date("2026-10-15T20:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-16");
    expect(businessNow("UTC", new Date("2026-10-15T20:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-15");
  });
});

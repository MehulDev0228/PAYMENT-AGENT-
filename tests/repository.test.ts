import { PGlite, type PGliteInterface } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, createCompany, seedDemo } from "@/lib/data/db-setup";
import { createMockRepository } from "@/lib/data/mock-repository";
import { businessNow, createPostgresRepository } from "@/lib/data/postgres-repository";
import type { AeraRepository } from "@/lib/data/repository";
import { DEMO_COMPANY_ID, DEMO_NOW } from "@/lib/data/seed";
import type { SqlClient, SqlDatabase } from "@/lib/data/sql";

const C = DEMO_COMPANY_ID;
const OTHER_COMPANY = "00000000-0000-0000-0000-0000000000aa";
const USER = "user-demo-manager";

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
}, 120_000);
afterAll(async () => { await template?.close(); });

async function freshPostgres() {
  const db = pgliteDatabase(await template.clone());
  return { db, repo: createPostgresRepository(db, { now: () => DEMO_NOW }) };
}

const adapters: Array<[string, () => Promise<AeraRepository>]> = [
  ["mock", async () => createMockRepository()],
  ["postgres", async () => (await freshPostgres()).repo],
];

describe.each(adapters)("%s repository", (_name, make) => {
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

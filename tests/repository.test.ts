import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite, type PGliteInterface } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, createCompany, seedDemo } from "@/lib/data/db-setup";
import { createMockRepository } from "@/lib/data/mock-repository";
import { businessNow, createPostgresRepository } from "@/lib/data/postgres-repository";
import type { AeraRepository, InvoiceImportRow } from "@/lib/data/repository";
import { DEMO_COMPANY_ID, DEMO_NOW } from "@/lib/data/seed";
import type { SqlClient, SqlDatabase } from "@/lib/data/sql";
import { parseInvoiceRows, parseWorkbook } from "@/lib/imports";

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

  describe("invoice ledger sync", () => {
    const find = async (invoiceNumber: string) => {
      const hit = (await repo.search(C, invoiceNumber)).find((item) => item.title === invoiceNumber)!;
      return (await repo.getInvoice(C, hit.id))!;
    };
    const ledgerRow = async (invoiceNumber: string, overrides: Partial<InvoiceImportRow> = {}): Promise<InvoiceImportRow> => {
      const invoice = await find(invoiceNumber);
      const customer = (await repo.getCustomer(C, invoice.customerId))!;
      return {
        invoice_number: invoice.invoiceNumber, customer_name: customer.name, customer_email: customer.email, invoice_date: invoice.invoiceDate, due_date: invoice.dueDate,
        amount: invoice.amount, currency: invoice.currency, customer_code: customer.customerCode, customer_phone: customer.phone, region: customer.region, account_manager: customer.accountManager,
        ...overrides,
      };
    };
    const openInvoiceCount = async () => (await repo.listCustomers(C)).reduce((total, item) => total + item.openInvoices, 0);

    it("previews an update without saving, then applies it with a before/after audit", async () => {
      const row = await ledgerRow("INV-1042", { amount: 90_000, due_date: "2026-10-05", region: "North", account_manager: "Kabir Shah" });
      const preview = await repo.importInvoices(C, [row], USER, { dryRun: true });
      expect(preview).toMatchObject({ dryRun: true, counts: { new: 0, updated: 1, unchanged: 0, flagged: 0, rejected: 0 } });
      expect(preview.rows[0].changes).toEqual(expect.arrayContaining([{ field: "amount", before: 84_000, after: 90_000 }, { field: "dueDate", before: "2026-09-20", after: "2026-10-05" }]));
      expect(await find("INV-1042")).toMatchObject({ amount: 84_000, dueDate: "2026-09-20" });

      const result = await repo.importInvoices(C, [row], USER);
      expect(result).toMatchObject({ dryRun: false, counts: preview.counts, imported: 1, rejected: 0 });
      const invoice = await find("INV-1042");
      expect(invoice).toMatchObject({ amount: 90_000, amountPaid: 0, amountOutstanding: 90_000, dueDate: "2026-10-05" });
      expect(await repo.getCustomer(C, invoice.customerId)).toMatchObject({ region: "North", accountManager: "Kabir Shah" });
      const [synced] = await repo.listAudit(C, { entityId: invoice.id, entityType: "invoice" });
      expect(synced).toMatchObject({ eventType: "invoice_synced", actorType: "human", actorId: USER });
      expect(synced.dataSnapshot.changes).toEqual(expect.arrayContaining([{ field: "amount", before: 84_000, after: 90_000 }, { field: "amountOutstanding", before: 84_000, after: 90_000 }]));
      const [customerEvent] = await repo.listAudit(C, { entityId: invoice.customerId, entityType: "customer" });
      expect(customerEvent.dataSnapshot.changes).toEqual(expect.arrayContaining([{ field: "customer.accountManager", before: expect.any(String), after: "Kabir Shah" }]));
    });

    it("re-imports the downloadable template unchanged", async () => {
      const csv = await readFile(path.join(process.cwd(), "public", "templates", "invoice-import.csv"), "utf8");
      const { rows, invalidRows } = parseInvoiceRows(await parseWorkbook(new File([csv], "invoice-import.csv")));
      expect(invalidRows).toEqual([]);
      expect((await repo.importInvoices(C, rows, USER, { dryRun: true })).counts).toEqual({ new: 0, updated: 0, unchanged: 1, flagged: 0, rejected: 0 });
    });

    it("reports an identical row as unchanged and writes no invoice event", async () => {
      const result = await repo.importInvoices(C, [await ledgerRow("INV-1042")], USER);
      expect(result.counts).toMatchObject({ unchanged: 1, updated: 0 });
      expect(result.rows).toHaveLength(0);
      expect((await repo.listAudit(C, { entityId: (await find("INV-1042")).id, entityType: "invoice" })).some((event) => event.eventType === "invoice_synced")).toBe(false);
    });

    it("never reduces the amount below payments AERA has matched", async () => {
      await repo.importPayments(C, [{ payment_reference: "UTR-SYNC-PART", invoice_number: "INV-1042", amount: 50_000, payment_date: "2026-09-29" }]);
      const below = await repo.importInvoices(C, [await ledgerRow("INV-1042", { amount: 40_000 })], USER);
      expect(below.rows[0]).toMatchObject({ outcome: "flagged", reconciliation: "amount_below_paid" });
      expect(await find("INV-1042")).toMatchObject({ amount: 84_000, amountPaid: 50_000, amountOutstanding: 34_000, reconciliationStatus: "amount_below_paid" });

      const creditNote = await repo.importInvoices(C, [await ledgerRow("INV-1042", { amount: 60_000 })], USER);
      expect(creditNote.rows[0].outcome).toBe("updated");
      expect(await find("INV-1042")).toMatchObject({ amount: 60_000, amountPaid: 50_000, amountOutstanding: 10_000, status: "partially_paid" });
      expect((await find("INV-1042")).reconciliationStatus).toBeUndefined();
    });

    it("closes the case when a credit note brings the amount down to what was paid", async () => {
      await repo.importPayments(C, [{ payment_reference: "UTR-SYNC-CN", invoice_number: "INV-1042", amount: 80_000, payment_date: "2026-09-29" }]);
      await repo.importInvoices(C, [await ledgerRow("INV-1042", { amount: 80_000 })], USER);
      expect(await find("INV-1042")).toMatchObject({ amountOutstanding: 0, status: "paid" });
      expect((await caseFor("INV-1042")).status).toBe("closed");
    });

    it("records a differing ERP balance for reconciliation instead of overwriting it", async () => {
      const mismatch = await repo.importInvoices(C, [await ledgerRow("INV-1042", { outstanding: 70_000 })], USER);
      expect(mismatch).toMatchObject({ reviewRequired: 1, counts: { flagged: 1 } });
      expect(mismatch.rows[0]).toMatchObject({ reconciliation: "balance_mismatch", message: expect.stringContaining("lower") });
      expect(await find("INV-1042")).toMatchObject({ amountOutstanding: 84_000, erpOutstanding: 70_000, reconciliationStatus: "balance_mismatch" });

      // A file without the balance column keeps the open question; a matching balance resolves it.
      expect((await repo.importInvoices(C, [await ledgerRow("INV-1042")], USER)).counts.flagged).toBe(1);
      const resolved = await repo.importInvoices(C, [await ledgerRow("INV-1042", { outstanding: 84_000 })], USER);
      expect(resolved.rows[0].changes).toEqual(expect.arrayContaining([{ field: "reconciliationStatus", before: "balance_mismatch", after: null }]));
      expect((await find("INV-1042")).reconciliationStatus).toBeUndefined();
      expect((await find("INV-1042")).erpOutstanding).toBeUndefined();
    });

    it("flags open invoices missing from a full ledger without closing them, and pauses their reminders", async () => {
      const open = await openInvoiceCount();
      const missing = await find("INV-1044");
      expect(missing.amountOutstanding).toBeGreaterThan(0);
      const partial = await repo.importInvoices(C, [await ledgerRow("INV-1042")], USER);
      expect(partial.counts.flagged).toBe(0);

      const result = await repo.importInvoices(C, [await ledgerRow("INV-1042")], USER, { fullLedger: true, invalidRows: [{ row: 3, invoiceNumber: "INV-1043", message: "customer_email: Invalid email" }] });
      expect(result.counts).toMatchObject({ unchanged: 1, rejected: 1 });
      const listed = [await find("INV-1042"), await find("INV-1043")].filter((invoice) => invoice.amountOutstanding > 0).length;
      expect(result.counts.flagged).toBe(open - listed);
      expect(result.rows.find((row) => row.invoiceNumber === "INV-1043")?.outcome).toBe("rejected");
      expect(result.rows.find((row) => row.invoiceNumber === "INV-1044")).toMatchObject({ outcome: "flagged", reconciliation: "missing_from_ledger" });
      expect(await find("INV-1044")).toMatchObject({ status: missing.status, amountOutstanding: missing.amountOutstanding, reconciliationStatus: "missing_from_ledger" });
      expect((await openInvoiceCount())).toBe(open);
      expect((await repo.listAudit(C, { entityId: missing.id }))[0].eventType).toBe("invoice_missing_from_ledger");

      const kept = await find("INV-1042");
      expect((await (await make()).runDailyMonitor(C)).created).toBeGreaterThan(0);
      const created = (await repo.runDailyMonitor(C)).actions;
      expect(created.every((action) => action.invoiceId === kept.id)).toBe(true);

      // Settling it in AERA explains why the ERP no longer lists it.
      await repo.importPayments(C, [{ payment_reference: "UTR-SYNC-MISSING", invoice_number: "INV-1044", amount: missing.amountOutstanding, payment_date: "2026-09-29" }]);
      expect((await find("INV-1044")).reconciliationStatus).toBeUndefined();
    });

    it("opens a new invoice at the ERP balance and creates its customer once", async () => {
      const base = { customer_name: "Zephyr Traders", customer_email: "ap@zephyr.example", invoice_date: "2026-09-01", due_date: "2026-10-30", amount: 50_000, currency: "INR", customer_code: "CUS-ZEPHYR" };
      const result = await repo.importInvoices(C, [{ ...base, invoice_number: "INV-NEW-1", outstanding: 20_000 }, { ...base, invoice_number: "INV-NEW-2" }], USER);
      expect(result.counts).toMatchObject({ new: 2, rejected: 0 });
      expect(await find("INV-NEW-1")).toMatchObject({ amount: 50_000, amountPaid: 30_000, amountOutstanding: 20_000, status: "partially_paid" });
      expect(await find("INV-NEW-2")).toMatchObject({ amountPaid: 0, amountOutstanding: 50_000, status: "pending" });
      expect((await repo.listCustomers(C, "CUS-ZEPHYR"))).toHaveLength(1);
    });

    it("rejects conflicting rows one by one", async () => {
      const row = await ledgerRow("INV-1042");
      const result = await repo.importInvoices(C, [
        row,
        { ...row, due_date: "2026-12-01" },
        { ...(await ledgerRow("INV-1043")), currency: "USD" },
        { ...(await ledgerRow("INV-1045")), customer_code: "CUS-9999" },
        { ...(await ledgerRow("INV-1046")), outstanding: 99_999_999 },
      ], USER);
      expect(result.counts).toMatchObject({ unchanged: 1, rejected: 4 });
      expect(result.errors.map((error) => error.row)).toEqual([3, 4, 5, 6]);
      expect(result.errors[0].message).toMatch(/more than once/);
      expect((await find("INV-1042")).dueDate).toBe("2026-09-20");
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

  it("persists reconciliation flags, and a preview writes nothing", async () => {
    const { db, repo } = await freshPostgres();
    const { invoice, customer } = (await repo.listCases(C, { q: "INV-1042" })).find((c) => c.invoice.invoiceNumber === "INV-1042")!;
    const row = { invoice_number: "INV-1042", customer_name: customer.name, customer_email: customer.email, invoice_date: invoice.invoiceDate, due_date: invoice.dueDate, amount: 84_000, currency: "INR", outstanding: 70_000 };
    const auditCount = () => db.query("select count(*)::int as n from public.audit_events");
    const before = await auditCount();
    expect((await repo.importInvoices(C, [row], USER, { dryRun: true, fullLedger: true })).counts.flagged).toBeGreaterThan(1);
    expect(await auditCount()).toEqual(before);
    expect(await db.query("select count(*)::int as n from public.invoices where reconciliation_status is not null")).toEqual([{ n: 0 }]);

    await repo.importInvoices(C, [row], USER);
    const [stored] = await db.query<{ reconciliation_status: string; erp_outstanding: string }>("select reconciliation_status, erp_outstanding::text from public.invoices where company_id = $1 and invoice_number = 'INV-1042'", [C]);
    expect(stored.reconciliation_status).toBe("balance_mismatch");
    expect(Number(stored.erp_outstanding)).toBe(70_000);
    const restarted = createPostgresRepository(db, { now: () => DEMO_NOW, readCacheMs: 0 });
    expect(await restarted.getInvoice(C, invoice.id)).toMatchObject({ amountOutstanding: 84_000, erpOutstanding: 70_000, reconciliationStatus: "balance_mismatch" });
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

import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/data/mock-repository";
import { DEMO_COMPANY_ID } from "@/lib/data/seed";

const C = DEMO_COMPANY_ID;
let repo: MockRepository;
beforeEach(() => { repo = new MockRepository(); });

const caseFor = (invoiceNumber: string) => repo.listCases(C, { q: invoiceNumber }).find((item) => item.invoice.invoiceNumber === invoiceNumber)!;

describe("acceptance scenario: INV-1042", () => {
  it("starts with an active promise for 29 September", () => {
    const item = caseFor("INV-1042");
    expect(item.status).toBe("payment_promised");
    expect(item.activePromise?.promisedDate).toBe("2026-09-29");
    expect(item.invoice.amountOutstanding).toBe(84_000);
  });

  it("closes the case and fulfils the promise when the payment is imported", () => {
    const result = repo.importPayments(C, [{ payment_reference: "UTR-ACCEPT-1", invoice_number: "INV-1042", amount: 84_000, payment_date: "2026-09-29" }]);
    expect(result).toMatchObject({ imported: 1, rejected: 0 });
    const item = repo.getCase(C, caseFor("INV-1042").id)!;
    expect(item.status).toBe("closed");
    expect(item.invoice.status).toBe("paid");
    expect(item.promises.find((p) => p.id === "promise-inv-1042")?.status).toBe("fulfilled");
    expect(repo.listAudit(C, { entityId: item.id }).some((e) => e.eventType === "case_status_changed" && e.dataSnapshot.to === "closed")).toBe(true);
  });

  it("rejects a duplicate payment reference", () => {
    const row = { payment_reference: "UTR-DUP", invoice_number: "INV-1042", amount: 1000, payment_date: "2026-09-29" };
    repo.importPayments(C, [row]);
    expect(repo.importPayments(C, [row])).toMatchObject({ imported: 0, rejected: 1 });
  });

  it("keeps the case open on a partial payment", () => {
    repo.importPayments(C, [{ payment_reference: "UTR-PART", invoice_number: "INV-1042", amount: 4_000, payment_date: "2026-09-29" }]);
    const item = caseFor("INV-1042");
    expect(item.status).toBe("payment_promised");
    expect(item.invoice.amountOutstanding).toBe(80_000);
  });
});

describe("customer replies", () => {
  const reply = (body: string, id: string, invoiceNumber: string) => {
    const item = caseFor(invoiceNumber);
    return { from: item.customer.email, subject: `Re: ${invoiceNumber}`, body, externalMessageId: id };
  };
  const promise = { intent: "payment_promise" as const, promised_date: "2026-10-02", promised_amount: null, confidence: 0.93, requires_human: false };

  it("records a promise from a promise reply", () => {
    const target = repo.listCases(C, { statuses: ["reminder_sent"] })[0];
    const result = repo.recordReply(C, reply("We will pay on 2026-10-02.", "m-1", target.invoice.invoiceNumber), promise);
    expect(result.promiseId).toBeDefined();
    expect(caseFor(target.invoice.invoiceNumber).status).toBe("payment_promised");
  });

  it("raises an approval for a payment plan request", () => {
    const target = repo.listCases(C, { statuses: ["reminder_sent"] })[1];
    const result = repo.recordReply(C, reply("Can we pay 50% now and the rest next month?", "m-2", target.invoice.invoiceNumber), { intent: "payment_plan_request", promised_date: null, promised_amount: null, confidence: 0.98, requires_human: true });
    expect(result.requiresHuman).toBe(true);
    expect(repo.listApprovals(C).some((a) => a.id === result.approvalActionId)).toBe(true);
    expect(caseFor(target.invoice.invoiceNumber).status).toBe("escalated");
  });

  it("is idempotent on the external message id", () => {
    const target = repo.listCases(C, { statuses: ["reminder_sent"] })[2];
    const input = reply("We will pay on 2026-10-02.", "m-3", target.invoice.invoiceNumber);
    repo.recordReply(C, input, promise);
    const promisesBefore = repo.listPromises(C).length;
    expect(repo.recordReply(C, input, promise).duplicate).toBe(true);
    expect(repo.listPromises(C).length).toBe(promisesBefore);
  });
});

describe("payment review", () => {
  it("lists candidates and applies a manual match", () => {
    const [pending] = repo.listPayments(C, "payment_match_review_required");
    const target = repo.paymentCandidates(C, pending.id).find((c) => c.invoice.invoiceNumber === "INV-1042")!;
    expect(target).toBeDefined();
    repo.resolvePayment(C, pending.id, target.invoice.id, "user-demo-manager");
    expect(repo.listPayments(C, "payment_match_review_required")).toHaveLength(0);
    expect(caseFor("INV-1042").status).toBe("closed");
    expect(() => repo.resolvePayment(C, pending.id, target.invoice.id, "user-demo-manager")).toThrow(/already matched/);
  });
});

describe("approvals and automation", () => {
  it("records the human decision and refuses a second decision", () => {
    const [approval] = repo.listApprovals(C);
    repo.decideAction(C, approval.id, "approved", "user-demo-manager");
    expect(repo.listAudit(C, { entityId: approval.id })[0]).toMatchObject({ actorType: "human", eventType: "action_approved" });
    expect(() => repo.decideAction(C, approval.id, "rejected", "user-demo-manager")).toThrow();
  });

  it("creates at most one action per invoice and policy step", () => {
    repo.runDailyMonitor(C);
    expect(repo.runDailyMonitor(C).created).toBe(0);
  });

  it("never stacks a second open decision on a case", () => {
    repo.runDailyMonitor(C);
    const open = repo.listActions(C, "awaiting_approval");
    expect(new Set(open.map((action) => action.collectionCaseId)).size).toBe(open.length);
  });

  it("does not re-queue policy steps already handled in the seed", () => {
    const seeded = repo.listActions(C).filter((action) => action.createdBy === "aera" && action.dataSnapshot.policyStepId);
    expect(seeded.length).toBeGreaterThan(100);
    const created = repo.runDailyMonitor(C).actions;
    expect(created.some((action) => seeded.some((s) => s.invoiceId === action.invoiceId && s.dataSnapshot.policyStepId === action.dataSnapshot.policyStepId))).toBe(false);
  });

  it("scopes every read to the company", () => {
    expect(repo.listCases("another-company")).toHaveLength(0);
    expect(repo.overview("another-company").totalOutstanding).toBe(0);
    expect(repo.search("another-company", "INV-1042")).toHaveLength(0);
  });
});

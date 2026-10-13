import { describe, expect, it } from "vitest";
import { matchPayment } from "@/lib/domain/payment-matching";
import { applicablePolicyStep, defaultPolicy, priorityFor } from "@/lib/domain/policy";
import { replyOutcome } from "@/lib/domain/reply-outcome";
import { canTransition } from "@/lib/domain/state-machine";
import type { Invoice } from "@/lib/domain/types";

const invoice = (overrides: Partial<Invoice>): Invoice => ({
  id: "inv-1", companyId: "c", customerId: "cust-1", invoiceNumber: "INV-1", invoiceDate: "2026-08-01", dueDate: "2026-09-01",
  amount: 1000, currency: "INR", amountPaid: 0, amountOutstanding: 1000, status: "overdue", source: "test", createdAt: "", updatedAt: "", ...overrides,
});

describe("payment matching", () => {
  const codes = new Map([["cust-1", "CUS-1"], ["cust-2", "CUS-2"]]);
  it("matches on exact invoice number", () => {
    const result = matchPayment({ invoiceNumber: "inv-2", paymentReference: "x", amount: 5, paymentDate: "2026-09-01" }, [invoice({}), invoice({ id: "inv-2", invoiceNumber: "INV-2" })], codes);
    expect(result).toMatchObject({ status: "matched", invoiceId: "inv-2" });
  });
  it("matches an invoice number embedded in the reference", () => {
    expect(matchPayment({ paymentReference: "NEFT/INV-1/ACME", amount: 1, paymentDate: "" }, [invoice({})], codes).invoiceId).toBe("inv-1");
  });
  it("requires review when amount matches several invoices", () => {
    const result = matchPayment({ paymentReference: "UTR-1", amount: 1000, paymentDate: "" }, [invoice({}), invoice({ id: "inv-2", invoiceNumber: "INV-2", customerId: "cust-2" })], codes);
    expect(result.status).toBe("payment_match_review_required");
    expect(result.candidates).toHaveLength(2);
  });
  it("narrows by customer code before amount", () => {
    const result = matchPayment({ paymentReference: "UTR-1", amount: 1000, customerCode: "CUS-2", paymentDate: "" }, [invoice({}), invoice({ id: "inv-2", invoiceNumber: "INV-2", customerId: "cust-2" })], codes);
    expect(result).toMatchObject({ status: "matched", invoiceId: "inv-2" });
  });
  it("never matches settled invoices", () => {
    expect(matchPayment({ invoiceNumber: "INV-1", paymentReference: "x", amount: 1000, paymentDate: "" }, [invoice({ amountOutstanding: 0, status: "paid" })], codes).status).toBe("unmatched");
  });
});

describe("policy", () => {
  const policy = defaultPolicy("c");
  const now = new Date("2026-09-27T09:00:00Z");
  it("picks the highest threshold reached", () => {
    expect(applicablePolicyStep(invoice({ dueDate: "2026-09-10" }), policy, now)?.id).toBe("manager-15");
    expect(applicablePolicyStep(invoice({ dueDate: "2026-09-24" }), policy, now)?.id).toBe("friendly-3");
  });
  it("skips settled invoices", () => {
    expect(applicablePolicyStep(invoice({ amountOutstanding: 0 }), policy, now)).toBeUndefined();
  });
  it("requires a human for every escalation step", () => {
    for (const step of policy.steps.filter((s) => s.action === "escalation")) expect(step.requiresHumanApproval).toBe(true);
  });
  it("ranks priority by age and exposure", () => {
    expect(priorityFor(31, 1)).toBe("critical");
    expect(priorityFor(0, 600_000)).toBe("critical");
    expect(priorityFor(8, 1)).toBe("medium");
    expect(priorityFor(1, 1)).toBe("low");
  });
});

describe("reply outcome", () => {
  const base = { promised_date: null, promised_amount: null, confidence: 0.95, requires_human: false } as const;
  it("records a future promise", () => {
    expect(replyOutcome({ ...base, intent: "payment_promise", promised_date: "2026-09-29" }, "2026-09-27")).toMatchObject({ caseStatus: "payment_promised", recordPromise: true, requestApproval: false });
  });
  it("does not record a promise dated in the past", () => {
    expect(replyOutcome({ ...base, intent: "payment_promise", promised_date: "2026-09-01" }, "2026-09-27").recordPromise).toBe(false);
  });
  it.each(["payment_dispute", "payment_plan_request", "request_for_extension"] as const)("routes %s to a human even if the classifier did not flag it", (intent) => {
    expect(replyOutcome({ ...base, intent }, "2026-09-27")).toMatchObject({ caseStatus: "escalated", requestApproval: true });
  });
  it("does not act automatically on low confidence", () => {
    expect(replyOutcome({ ...base, intent: "payment_promise", promised_date: "2026-09-29", confidence: 0.5 }, "2026-09-27").recordPromise).toBe(false);
  });
  it("never closes a case on the customer's word alone", () => {
    expect(replyOutcome({ ...base, intent: "payment_completed" }, "2026-09-27").caseStatus).toBe("customer_replied");
  });
});

describe("state machine", () => {
  it("allows closing from every open state", () => {
    for (const from of ["overdue", "reminder_pending", "reminder_sent", "customer_replied", "payment_promised", "promise_missed", "escalated", "payment_received"] as const) expect(canTransition(from, "closed")).toBe(true);
  });
  it("treats closed as terminal", () => {
    expect(canTransition("closed", "overdue")).toBe(false);
  });
});

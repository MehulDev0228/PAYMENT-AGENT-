import type { CaseStatus } from "./types";

const transitions: Record<CaseStatus, CaseStatus[]> = {
  monitoring: ["due", "closed"],
  due: ["overdue", "reminder_pending", "closed"],
  overdue: ["reminder_pending", "customer_replied", "escalated", "payment_received", "closed"],
  reminder_pending: ["reminder_sent", "customer_replied", "escalated", "closed"],
  reminder_sent: ["customer_replied", "reminder_pending", "payment_received", "escalated", "closed"],
  customer_replied: ["payment_promised", "reminder_pending", "escalated", "payment_received", "closed"],
  // A customer may write again while a promise is open (e.g. raise a dispute).
  payment_promised: ["payment_received", "promise_missed", "customer_replied", "escalated", "closed"],
  payment_received: ["closed"],
  promise_missed: ["escalated", "customer_replied", "payment_received", "closed"],
  escalated: ["payment_promised", "customer_replied", "payment_received", "closed"],
  closed: [],
};

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: CaseStatus, to: CaseStatus): void {
  if (!canTransition(from, to)) throw new Error(`Invalid collection case transition: ${from} -> ${to}`);
}

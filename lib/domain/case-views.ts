import type { CaseStatus } from "./types";

export const OPEN_CASE_STATUSES: CaseStatus[] = ["monitoring", "due", "overdue", "reminder_pending", "reminder_sent", "customer_replied", "payment_promised", "promise_missed", "escalated", "payment_received"];

/** Named queue views over case statuses, shared by the UI and the API. */
export const CASE_VIEWS = {
  open: { label: "All open", statuses: OPEN_CASE_STATUSES },
  attention: { label: "Needs attention", statuses: ["overdue", "reminder_pending", "customer_replied", "promise_missed"] as CaseStatus[] },
  reminded: { label: "Reminded", statuses: ["reminder_sent"] as CaseStatus[] },
  promised: { label: "Promised", statuses: ["payment_promised"] as CaseStatus[] },
  escalated: { label: "Escalated", statuses: ["escalated"] as CaseStatus[] },
  closed: { label: "Closed", statuses: ["payment_received", "closed"] as CaseStatus[] },
} as const;

export type CaseView = keyof typeof CASE_VIEWS;

export function isCaseView(value: string | undefined): value is CaseView {
  return value !== undefined && value in CASE_VIEWS;
}

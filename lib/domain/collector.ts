import type { AgeingBucket, CallOutcome } from "./types";

export const CALL_OUTCOMES: CallOutcome[] = ["reached", "no_answer", "promised", "disputed"];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  reached: "Reached",
  no_answer: "No answer",
  promised: "Promised to pay",
  disputed: "Disputed",
};

export function isCallOutcome(value: unknown): value is CallOutcome {
  return typeof value === "string" && CALL_OUTCOMES.includes(value as CallOutcome);
}

/** The 30-day bands of a classic receivables ageing sheet. */
export const AGEING_BUCKETS: Array<{ key: AgeingBucket; label: string }> = [
  { key: "notDue", label: "Not due" },
  { key: "days1to30", label: "1–30 days" },
  { key: "days31to60", label: "31–60 days" },
  { key: "days61to90", label: "61–90 days" },
  { key: "days90plus", label: "90+ days" },
];

export function ageingBucket(daysOverdue: number): AgeingBucket {
  if (daysOverdue <= 0) return "notDue";
  if (daysOverdue <= 30) return "days1to30";
  if (daysOverdue <= 60) return "days31to60";
  if (daysOverdue <= 90) return "days61to90";
  return "days90plus";
}

/** Assignee filter values in URLs: "me", "none" (unassigned) or a user id. */
export function resolveAssigneeFilter(value: string | null | undefined, currentUserId: string): string | null | undefined {
  if (!value) return undefined;
  if (value === "me") return currentUserId;
  if (value === "none") return null;
  return value;
}

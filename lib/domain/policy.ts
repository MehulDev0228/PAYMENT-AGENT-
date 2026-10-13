import type { CollectionPolicy, CollectionPolicyStep, Invoice } from "./types";
import { daysBetween } from "./money";

export const defaultPolicy = (companyId: string): CollectionPolicy => ({
  companyId,
  steps: [
    { id: "due", daysOverdue: 0, action: "reminder", tone: "friendly", requiresHumanApproval: false },
    { id: "friendly-3", daysOverdue: 3, action: "reminder", tone: "friendly", requiresHumanApproval: false },
    { id: "firm-7", daysOverdue: 7, action: "reminder", tone: "firm", requiresHumanApproval: false },
    { id: "manager-15", daysOverdue: 15, action: "escalation", tone: "firm", requiresHumanApproval: true, escalationLevel: "manager" },
    { id: "high-30", daysOverdue: 30, action: "escalation", tone: "urgent", requiresHumanApproval: true, escalationLevel: "high_priority" },
  ],
});

export function applicablePolicyStep(invoice: Invoice, policy: CollectionPolicy, now: Date): CollectionPolicyStep | undefined {
  if (invoice.amountOutstanding <= 0 || invoice.status === "cancelled") return undefined;
  const overdue = daysBetween(invoice.dueDate, now);
  return [...policy.steps]
    .filter((step) => step.daysOverdue <= overdue)
    .sort((a, b) => b.daysOverdue - a.daysOverdue)[0];
}

export function priorityFor(daysOverdue: number, outstanding: number): "low" | "medium" | "high" | "critical" {
  if (daysOverdue >= 30 || outstanding >= 500_000) return "critical";
  if (daysOverdue >= 15 || outstanding >= 200_000) return "high";
  if (daysOverdue >= 7 || outstanding >= 75_000) return "medium";
  return "low";
}

import type { CaseStatus } from "./types";

export type ReplyIntent =
  | "payment_completed"
  | "payment_initiated"
  | "payment_promise"
  | "payment_delay"
  | "payment_dispute"
  | "invoice_question"
  | "request_for_documents"
  | "request_for_extension"
  | "payment_plan_request"
  | "general_reply"
  | "unknown";

export interface ReplyClassificationInput {
  intent: ReplyIntent;
  promised_date: string | null;
  promised_amount: number | null;
  confidence: number;
  requires_human: boolean;
}

export interface ReplyOutcome {
  caseStatus: CaseStatus;
  nextAction: string;
  recordPromise: boolean;
  requestApproval: boolean;
  reason: string;
}

// Intents that touch terms, amounts or disputes. AERA never decides these.
const HUMAN_INTENTS = new Set<ReplyIntent>(["payment_dispute", "request_for_extension", "payment_plan_request"]);
const MIN_AUTOMATIC_CONFIDENCE = 0.8;

/**
 * Deterministic mapping from a (possibly AI-produced) classification to the
 * operational outcome. The classifier only describes the message; this
 * function decides what the system is allowed to do with it.
 */
export function replyOutcome(classification: ReplyClassificationInput, today: string): ReplyOutcome {
  const { intent, confidence } = classification;

  if (classification.requires_human || HUMAN_INTENTS.has(intent)) {
    return { caseStatus: "escalated", nextAction: "Human review required", recordPromise: false, requestApproval: true, reason: `Customer reply classified as ${intent}; this requires a human decision` };
  }
  if (confidence < MIN_AUTOMATIC_CONFIDENCE) {
    return { caseStatus: "customer_replied", nextAction: "Review customer reply (low classification confidence)", recordPromise: false, requestApproval: false, reason: `Classification confidence ${confidence.toFixed(2)} is below the automatic threshold` };
  }
  if (intent === "payment_promise" && classification.promised_date && classification.promised_date >= today) {
    return { caseStatus: "payment_promised", nextAction: `Verify promised payment on ${classification.promised_date}`, recordPromise: true, requestApproval: false, reason: `Customer promised payment on ${classification.promised_date}` };
  }
  if (intent === "payment_completed" || intent === "payment_initiated") {
    return { caseStatus: "customer_replied", nextAction: "Confirm payment against the next bank import", recordPromise: false, requestApproval: false, reason: "Customer reports payment; AERA does not close cases until a payment is matched" };
  }
  return { caseStatus: "customer_replied", nextAction: "Review customer reply", recordPromise: false, requestApproval: false, reason: `Customer reply classified as ${intent}` };
}

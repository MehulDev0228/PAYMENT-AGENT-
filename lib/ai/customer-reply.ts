import OpenAI from "openai";
import { z } from "zod";

const ReplyClassification = z.object({
  intent: z.enum(["payment_completed", "payment_initiated", "payment_promise", "payment_delay", "payment_dispute", "invoice_question", "request_for_documents", "request_for_extension", "payment_plan_request", "general_reply", "unknown"]),
  promised_date: z.string().nullable(),
  promised_amount: z.number().nullable(),
  confidence: z.number().min(0).max(1),
  requires_human: z.boolean(),
});

export type ReplyClassification = z.infer<typeof ReplyClassification>;

const schema = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["payment_completed", "payment_initiated", "payment_promise", "payment_delay", "payment_dispute", "invoice_question", "request_for_documents", "request_for_extension", "payment_plan_request", "general_reply", "unknown"] },
    promised_date: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
    promised_amount: { anyOf: [{ type: "number" }, { type: "null" }] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    requires_human: { type: "boolean" },
  },
  required: ["intent", "promised_date", "promised_amount", "confidence", "requires_human"],
  additionalProperties: false,
} as const;

export async function classifyCustomerReply(message: string, today: string): Promise<ReplyClassification> {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) return localClassification(message, today);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL,
    input: [
      { role: "system", content: `Classify an accounts-receivable customer email. Today is ${today}. Never approve discounts, extensions, payment plans, waived amounts, term changes, legal action, or suspension. Any such request requires a human. Extract only facts stated by the customer.` },
      { role: "user", content: message },
    ],
    text: { format: { type: "json_schema", name: "customer_reply", strict: true, schema } },
  });
  return ReplyClassification.parse(JSON.parse(response.output_text));
}

function localClassification(message: string, today: string): ReplyClassification {
  const lower = message.toLowerCase();
  const requiresHuman = /(discount|waive|payment plan|installment|50%|extension|dispute|incorrect|legal)/i.test(message);
  let intent: ReplyClassification["intent"] = "general_reply";
  if (/(payment plan|installment|50%|part now)/i.test(message)) intent = "payment_plan_request";
  else if (/(dispute|incorrect|wrong amount|not our invoice)/i.test(message)) intent = "payment_dispute";
  else if (/(paid|payment completed|transferred)/i.test(message)) intent = "payment_completed";
  else if (/(will pay|payment.*(?:on|by)|pay.*(?:on|by))/i.test(message)) intent = "payment_promise";
  else if (/(delay|cash flow|late)/i.test(message)) intent = "payment_delay";
  const dateMatch = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const weekdayMatch = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  return {
    intent,
    promised_date: dateMatch?.[1] || (weekdayMatch ? nextWeekday(today, weekdayMatch[1]) : null),
    promised_amount: null,
    confidence: intent === "general_reply" ? 0.65 : 0.91,
    requires_human: requiresHuman,
  };
}

function nextWeekday(today: string, weekday: string): string {
  const target = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(weekday);
  const date = new Date(`${today}T00:00:00Z`);
  let delta = (target - date.getUTCDay() + 7) % 7;
  if (delta === 0) delta = 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

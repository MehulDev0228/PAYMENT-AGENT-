import OpenAI from "openai";
import type { Customer, Invoice } from "@/lib/domain/types";
import { formatMoney } from "@/lib/domain/money";

export interface GeneratedCommunication {
  subject: string;
  body: string;
  provider: "openai" | "local_mock";
}

export async function generateReminder(input: { customer: Customer; invoice: Invoice; tone: "friendly" | "firm" | "urgent" }): Promise<GeneratedCommunication> {
  const verified = {
    customerName: input.customer.name,
    invoiceNumber: input.invoice.invoiceNumber,
    amountOutstanding: formatMoney(input.invoice.amountOutstanding, input.invoice.currency),
    dueDate: input.invoice.dueDate,
    tone: input.tone,
  };
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) return localReminder(verified);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL,
    input: `Write a concise professional collection email using only this verified JSON: ${JSON.stringify(verified)}. Do not threaten, invent fees, discounts, consequences, terms, or claim payment was received. Return the subject on the first line and body after a blank line.`,
  });
  const [subjectLine, ...body] = response.output_text.trim().split("\n");
  return { subject: subjectLine.replace(/^subject:\s*/i, ""), body: body.join("\n").trim(), provider: "openai" };
}

function localReminder(verified: Record<string, string>): GeneratedCommunication {
  return {
    subject: `Payment reminder: ${verified.invoiceNumber}`,
    body: `Hello ${verified.customerName},\n\nThis is a ${verified.tone === "friendly" ? "friendly " : ""}reminder that ${verified.invoiceNumber}, with an outstanding balance of ${verified.amountOutstanding}, was due on ${verified.dueDate}. Please let us know the expected payment date or if you need a copy of the invoice.\n\nRegards,\nAccounts Receivable`,
    provider: "local_mock",
  };
}

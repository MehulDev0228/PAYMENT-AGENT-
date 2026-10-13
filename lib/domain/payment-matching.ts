import type { Invoice, Payment } from "./types";

export interface MatchResult {
  status: Payment["matchStatus"];
  invoiceId?: string;
  customerId?: string;
  notes: string;
  candidates: string[];
}

export function matchPayment(
  input: { invoiceNumber?: string; paymentReference: string; customerCode?: string; amount: number; paymentDate: string },
  invoices: Invoice[],
  customerCodeById: Map<string, string>,
): MatchResult {
  const normalizedInvoice = input.invoiceNumber?.trim().toLowerCase();
  let candidates = invoices.filter((invoice) => invoice.status !== "cancelled" && invoice.amountOutstanding > 0);

  if (normalizedInvoice) {
    const exact = candidates.filter((invoice) => invoice.invoiceNumber.toLowerCase() === normalizedInvoice);
    if (exact.length === 1) return { status: "matched", invoiceId: exact[0].id, customerId: exact[0].customerId, notes: "Exact invoice number match", candidates: [exact[0].id] };
    if (exact.length > 1) candidates = exact;
  }

  const reference = input.paymentReference.toLowerCase();
  const referenced = candidates.filter((invoice) => reference.includes(invoice.invoiceNumber.toLowerCase()));
  if (referenced.length === 1) return { status: "matched", invoiceId: referenced[0].id, customerId: referenced[0].customerId, notes: "Invoice number found in payment reference", candidates: [referenced[0].id] };
  if (referenced.length > 1) candidates = referenced;

  if (input.customerCode) {
    candidates = candidates.filter((invoice) => customerCodeById.get(invoice.customerId)?.toLowerCase() === input.customerCode?.toLowerCase());
  }

  const amountMatches = candidates.filter((invoice) => Math.abs(invoice.amountOutstanding - input.amount) < 0.01);
  if (amountMatches.length === 1) return { status: "matched", invoiceId: amountMatches[0].id, customerId: amountMatches[0].customerId, notes: "Unique customer and outstanding amount match", candidates: [amountMatches[0].id] };
  if (amountMatches.length > 1) candidates = amountMatches;

  if (candidates.length > 1) {
    return { status: "payment_match_review_required", notes: `Payment could match ${candidates.length} invoices; human review required`, candidates: candidates.map((invoice) => invoice.id) };
  }

  return { status: "unmatched", notes: "No sufficiently reliable invoice match", candidates: [] };
}

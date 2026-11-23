import { describe, expect, it } from "vitest";
import { parseInvoiceRows } from "@/lib/imports";

const base = { "Invoice Number": "INV-1", "Customer Name": "Acme", "Customer Email": "ap@acme.example", "Invoice Date": "2026-09-01", "Due Date": "2026-10-01", Amount: "1,20,000", Currency: "inr" };

describe("invoice ledger rows", () => {
  it("reads an optional balance column under its common ERP names", () => {
    const { rows, invalidRows } = parseInvoiceRows([{ ...base, "Balance Due": "₹45,000" }, { ...base, "Invoice Number": "INV-2", Outstanding: "" }]);
    expect(invalidRows).toEqual([]);
    expect(rows[0]).toMatchObject({ invoice_number: "INV-1", amount: 120_000, currency: "INR", outstanding: 45_000, row: 2 });
    expect(rows[1].outstanding).toBeUndefined();
  });

  it("rejects a bad row on its own and keeps its invoice number", () => {
    const { rows, invalidRows } = parseInvoiceRows([{ ...base, "Customer Email": "not-an-email" }, { ...base, "Invoice Number": "INV-2", "Customer Phone": 9_100_000_001 }]);
    expect(invalidRows).toEqual([{ row: 2, invoiceNumber: "INV-1", message: expect.stringContaining("email") }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ invoice_number: "INV-2", customer_phone: "9100000001", row: 3 });
  });
});

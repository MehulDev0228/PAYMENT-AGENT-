import type { Metadata } from "next";
import { ImportPanel } from "@/components/import-panel";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Imports" };

const SAFEGUARDS = [
  ["Tenant scoped", "Every row is written only to the authenticated company."],
  ["Duplicate aware", "Repeated invoice numbers and payment references are rejected per row."],
  ["Never guessed", "A payment that could fit more than one invoice waits for a person."],
];

export default function ImportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Data operations" title="Bring your ledger in." muted="Validated row by row before anything changes." />
      <div className="grid gap-4 xl:grid-cols-2">
        <ImportPanel kind="invoices" n="01" />
        <ImportPanel kind="payments" n="02" />
      </div>
      <section className="grid overflow-hidden rounded-2xl bg-ink text-white md:grid-cols-3">
        {SAFEGUARDS.map(([title, body], index) => (
          <div key={title} className="border-white/[0.07] p-6 md:border-l md:first:border-l-0 [&:not(:first-child)]:border-t md:[&:not(:first-child)]:border-t-0">
            <p className="font-mono text-[11px] text-white/40">0{index + 1}</p>
            <h2 className="mt-4 text-[16px] font-medium tracking-[-0.02em]">{title}</h2>
            <p className="mt-1.5 text-[13px] leading-6 text-white/55">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

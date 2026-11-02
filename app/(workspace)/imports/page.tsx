import type { Metadata } from "next";
import { ImportPanel } from "@/components/import-panel";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Upload" };

const SAFEGUARDS = [
  ["Only what's needed", "Bill number, customer email, amount due and due date. Any other column is ignored and never stored."],
  ["Private to you", "Only your company can see what you upload. Delete it any time."],
  ["Never guessed", "A payment that could fit two bills waits for you instead of being matched on a guess."],
];

export default function ImportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Upload" title="Only your unpaid bills." muted="Four columns. Never your cash, rates or books." />
      <div className="grid gap-4 xl:grid-cols-2">
        <ImportPanel kind="invoices" n="01" />
        <ImportPanel kind="payments" n="02" />
      </div>
      <section className="grid overflow-hidden rounded-2xl bg-ink text-white md:grid-cols-3">
        {SAFEGUARDS.map(([title, body], index) => (
          <div key={title} className="border-white/[0.07] p-6 md:border-l md:first:border-l-0 [&:not(:first-child)]:border-t md:[&:not(:first-child)]:border-t-0">
            <p className="eyebrow text-white/40">0{index + 1}</p>
            <h2 className="mt-4 text-[16px] font-medium tracking-[-0.02em]">{title}</h2>
            <p className="mt-1.5 text-[13px] leading-6 text-white/55">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

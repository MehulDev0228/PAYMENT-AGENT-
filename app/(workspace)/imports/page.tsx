import type { Metadata } from "next";
import { ImportPanel } from "@/components/import-panel";
import { PageHeader } from "@/components/ui";
import { canManage, getPageContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Imports" };
export const dynamic = "force-dynamic";

const SAFEGUARDS = [
  ["Tenant scoped", "Every row is written only to the authenticated company, and only to your regions."],
  ["Sync, never overwrite", "Re-imported invoices are refreshed with a before/after audit. ERP balances that disagree with AERA are flagged for reconciliation, not copied over."],
  ["Never guessed", "A payment that could fit more than one invoice waits for a person."],
];

export default async function ImportsPage() {
  const context = await getPageContext();
  const readOnly = !canManage(context);
  const regional = context.regions !== null;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Data operations" title="Bring your ledger in." muted="Preview every row before anything changes." />
      <div className="grid gap-4 xl:grid-cols-2">
        <ImportPanel kind="invoices" n="01" readOnly={readOnly} />
        <ImportPanel kind="payments" n="02" readOnly={readOnly || regional} readOnlyReason={readOnly ? undefined : "Bank files cover every region. A user with access to all regions imports them."} />
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

import type { Metadata } from "next";
import { Download, MapPinned } from "lucide-react";
import { RegionTable } from "@/components/region-table";
import { EmptyState, PageHeader, formatDate } from "@/components/ui";
import { getPageContext } from "@/lib/auth";
import { repository } from "@/lib/data";

export const metadata: Metadata = { title: "Regions" };
export const dynamic = "force-dynamic";

export default async function RegionsPage() {
  const context = await getPageContext();
  const [rows, total, today] = await Promise.all([repository.regionSummary(context), repository.overview(context), repository.today(context)]);
  const scopeNote = context.regions === null ? "Every region in the company." : `Your regions: ${context.regions.join(", ")}.`;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Region sheet · ${formatDate(today)}`} title="Receivables by region." muted="The per-region outstanding sheet, kept current by itself."
        actions={<a href="/api/regions?format=csv" className="btn-outline" download><Download size={15} /> Download CSV</a>}>
        <p className="mt-3 text-[13px] text-muted">{scopeNote} Ageing is days past due; promises due are active promises dated within 7 days. Amounts in INR.</p>
      </PageHeader>
      <div className="panel overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={MapPinned} title="No customers yet" body="Import an invoice sheet with a region column to see receivables by region." /> : <RegionTable rows={rows} total={total} />}
      </div>
    </div>
  );
}

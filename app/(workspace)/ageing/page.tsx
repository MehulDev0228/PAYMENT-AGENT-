import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { ExportLinks } from "@/components/export-links";
import { EmptyState, PageHeader, Pagination, StatTile, formatDate } from "@/components/ui";
import { getPageContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { AGEING_BUCKETS } from "@/lib/domain/collector";
import { formatMoney } from "@/lib/domain/money";

export const metadata: Metadata = { title: "Ageing report" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AgeingPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const report = await repository.ageingReport(await getPageContext());
  const pageCount = Math.max(1, Math.ceil(report.rows.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number(params.page) || 1));
  const rows = report.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const share = (amount: number) => (report.totals.total ? `${Math.round((amount / report.totals.total) * 100)}% of book` : "—");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Receivables ageing · as of ${formatDate(report.asOf)}`} title="Ageing report." muted="Open balances by customer, in 30-day bands past due."
        actions={<ExportLinks report="ageing" />} />

      <section aria-label="Ageing totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {AGEING_BUCKETS.map((bucket) => (
          <StatTile key={bucket.key} label={bucket.label} value={formatMoney(report.totals[bucket.key], "INR", true)} helper={share(report.totals[bucket.key])}
            accent={bucket.key === "days90plus" || bucket.key === "days61to90" ? "danger" : bucket.key === "notDue" ? "success" : "warning"} />
        ))}
      </section>

      <div className="panel overflow-hidden">
        {report.rows.length === 0 ? <EmptyState icon={CalendarRange} title="Nothing outstanding" body="Every invoice is paid." /> : (
          <div className="scrollbar overflow-x-auto">
            <table className="table-base min-w-[1000px]">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  {AGEING_BUCKETS.map((bucket) => <th key={bucket.key} scope="col" className="text-right">{bucket.label}</th>)}
                  <th scope="col" className="text-right">Total</th>
                  <th scope="col" className="text-right">Invoices</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.customerId}>
                    <td><Link href={`/customers/${row.customerId}`} className="block font-medium">{row.customerName}</Link><span className="font-mono text-[11.5px] text-muted">{row.customerCode}{row.region ? ` · ${row.region}` : ""}</span></td>
                    {AGEING_BUCKETS.map((bucket) => (
                      <td key={bucket.key} className={`tabular text-right ${row[bucket.key] && (bucket.key === "days90plus" || bucket.key === "days61to90") ? "font-medium text-danger" : row[bucket.key] ? "" : "text-muted"}`}>
                        {row[bucket.key] ? formatMoney(row[bucket.key]) : "—"}
                      </td>
                    ))}
                    <td className="tabular text-right font-medium">{formatMoney(row.total)}</td>
                    <td className="tabular text-right text-muted">{row.openInvoices}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line font-medium">
                  <th scope="row" className="px-5 py-3 text-left">Total · {report.rows.length} customers</th>
                  {AGEING_BUCKETS.map((bucket) => <td key={bucket.key} className="tabular px-4 py-3 text-right">{formatMoney(report.totals[bucket.key])}</td>)}
                  <td className="tabular px-4 py-3 text-right">{formatMoney(report.totals.total)}</td>
                  <td className="tabular px-5 py-3 text-right">{report.totals.openInvoices}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <Pagination page={page} pageCount={pageCount} total={report.rows.length} label="customers" hrefFor={(next) => (next > 1 ? `/ageing?page=${next}` : "/ageing")} />
      </div>
    </div>
  );
}

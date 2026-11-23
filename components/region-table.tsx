import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatMoney } from "@/lib/domain/money";
import type { CollectionOverview, RegionSummary } from "@/lib/domain/types";

const regionHref = (path: string, region: string | null) => (region ? `${path}?region=${encodeURIComponent(region)}` : path);
const money = (amount: number, compact: boolean) => (amount ? formatMoney(amount, "INR", compact) : <span className="text-muted">—</span>);

/**
 * Receivables per region. `compact` is the dashboard card; the full table is the /regions sheet with every
 * ageing bucket and a total row (`total` is the overview of everything the caller can see).
 */
export function RegionTable({ rows, total, compact = false }: { rows: RegionSummary[]; total?: CollectionOverview; compact?: boolean }) {
  const buckets = rows[0]?.aging.map((bucket) => bucket.label) ?? [];
  return (
    <div className="scrollbar overflow-x-auto">
      <table className={`table-base [&_th]:whitespace-nowrap ${compact ? "min-w-[620px]" : "min-w-[1180px]"}`}>
        <thead>
          <tr>
            <th scope="col">Region</th>
            {!compact && <th scope="col" className="text-right">Customers</th>}
            <th scope="col" className="text-right">Outstanding</th>
            <th scope="col" className="text-right">Overdue</th>
            {compact ? <th scope="col" className="text-right">30+ days</th> : buckets.map((label) => <th key={label} scope="col" className="text-right">{label}</th>)}
            <th scope="col" className="text-right">Promises due ≤ 7d</th>
            {!compact && <th scope="col" className="text-right">Missed</th>}
            <th scope="col" className="text-right">Collected this month</th>
            {!compact && <th scope="col"><span className="sr-only">Open</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const share = row.totalOutstanding ? Math.round((row.totalOverdue / row.totalOutstanding) * 100) : 0;
            return (
              <tr key={row.region ?? "none"} className="group">
                <td>
                  {row.region ? <Link href={regionHref("/dashboard", row.region)} className="font-medium hover:underline">{row.region}</Link> : <span className="font-medium text-muted">No region</span>}
                  {compact && <span className="tabular block text-[11.5px] text-muted">{row.customerCount} customers</span>}
                </td>
                {!compact && <td className="tabular text-right text-muted">{row.customerCount}</td>}
                <td className="tabular text-right">{money(row.totalOutstanding, compact)}</td>
                <td className="tabular text-right font-medium">{row.totalOverdue ? <span className="text-danger">{money(row.totalOverdue, compact)}</span> : money(0, compact)}{!compact && row.totalOverdue > 0 && <span className="block text-[11.5px] font-normal text-muted">{share}% · {row.overdueInvoiceCount} inv.</span>}</td>
                {compact
                  ? <td className="tabular text-right">{money(row.aging.at(-1)?.amount ?? 0, compact)}</td>
                  : row.aging.map((bucket) => <td key={bucket.label} className="tabular text-right">{money(bucket.amount, compact)}{bucket.count > 0 && <span className="block text-[11.5px] text-muted">{bucket.count} inv.</span>}</td>)}
                <td className="tabular text-right">{row.promisesDueCount ? <>{money(row.promisesDueAmount, compact)}<span className="block text-[11.5px] text-muted">{row.promisesDueCount} promise{row.promisesDueCount === 1 ? "" : "s"}</span></> : money(0, compact)}</td>
                {!compact && <td className="tabular text-right">{row.missedPromiseCount ? <span className="text-danger">{row.missedPromiseCount}</span> : <span className="text-muted">—</span>}</td>}
                <td className="tabular text-right text-success">{money(row.collectedThisMonth, compact)}</td>
                {!compact && (
                  <td className="whitespace-nowrap text-right text-[12.5px]">
                    {row.region && <><Link href={regionHref("/cases", row.region)} className="text-muted hover:text-ink">Cases</Link><span className="px-1.5 text-line">·</span><Link href={regionHref("/customers", row.region)} className="inline-flex items-center gap-0.5 text-muted hover:text-ink">Customers <ArrowUpRight size={13} aria-hidden="true" /></Link></>}
                  </td>
                )}
              </tr>
            );
          })}
          {total && !compact && rows.length > 1 && (
            <tr className="bg-[#fafbfc] font-medium">
              <td>Total</td>
              <td className="tabular text-right">{rows.reduce((sum, row) => sum + row.customerCount, 0)}</td>
              <td className="tabular text-right">{money(total.totalOutstanding, false)}</td>
              <td className="tabular text-right text-danger">{money(total.totalOverdue, false)}</td>
              {total.aging.map((bucket) => <td key={bucket.label} className="tabular text-right">{money(bucket.amount, false)}</td>)}
              <td className="tabular text-right">{money(rows.reduce((sum, row) => sum + row.promisesDueAmount, 0), false)}</td>
              <td className="tabular text-right">{total.missedPromiseCount || "—"}</td>
              <td className="tabular text-right text-success">{money(total.collectedThisMonth, false)}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

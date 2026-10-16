import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Inbox } from "lucide-react";
import { EmptyState, PageHeader, StatusBadge, Tabs, formatDate } from "@/components/ui";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { daysBetween, formatMoney } from "@/lib/domain/money";
import type { PromiseStatus } from "@/lib/domain/types";

export const metadata: Metadata = { title: "Promises" };
export const dynamic = "force-dynamic";

const VIEWS: Array<{ key: PromiseStatus; label: string }> = [{ key: "active", label: "Active" }, { key: "missed", label: "Missed" }, { key: "fulfilled", label: "Kept" }, { key: "cancelled", label: "Superseded" }];

export default async function PromisesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { companyId } = getRequestContext();
  const view = VIEWS.find((item) => item.key === status)?.key ?? "active";
  const all = await repository.listPromiseItems(companyId);
  const items = all.filter((item) => item.status === view);
  const today = await repository.today(companyId);
  const total = items.reduce((sum, item) => sum + (item.promisedAmount ?? item.amountOutstanding), 0);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Payment promises" title="What customers said they'd pay." muted="Checked against the bank, not taken on trust." />
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-3 pt-1">
          <Tabs active={view} items={VIEWS.map((item) => ({ key: item.key, label: item.label, href: item.key === "active" ? "/promises" : `/promises?status=${item.key}`, count: all.filter((promise) => promise.status === item.key).length }))} />
          <p className="tabular px-2 pb-3 text-[13px] text-muted">{formatMoney(total)} promised in this view</p>
        </div>
        {items.length === 0 ? <EmptyState icon={Inbox} title="No promises in this view" /> : (
          <div className="scrollbar overflow-x-auto">
            <table className="table-base min-w-[760px]">
              <thead><tr><th scope="col">Customer · invoice</th><th scope="col">Promised for</th><th scope="col" className="text-right">Promised</th><th scope="col" className="text-right">Still outstanding</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {items.map((item) => {
                  const delta = item.promisedDate >= today ? `in ${daysBetween(today, new Date(`${item.promisedDate}T00:00:00Z`))}d` : `${daysBetween(item.promisedDate, new Date(`${today}T00:00:00Z`))}d ago`;
                  return (
                    <tr key={item.id} className="group">
                      <td><span className="block font-medium">{item.customerName}</span><span className="font-mono text-[11.5px] text-muted">{item.invoiceNumber}</span></td>
                      <td className="tabular">{formatDate(item.promisedDate)} <span className="text-[12px] text-muted">· {delta}</span></td>
                      <td className="tabular text-right font-medium">{formatMoney(item.promisedAmount ?? item.amountOutstanding)}</td>
                      <td className="tabular text-right text-muted">{formatMoney(item.amountOutstanding)}</td>
                      <td><StatusBadge value={item.status} /></td>
                      <td className="w-12 text-right">{item.collectionCaseId && <Link href={`/cases/${item.collectionCaseId}`} aria-label={`Open case for ${item.invoiceNumber}`} className="inline-grid size-9 place-items-center rounded-lg text-muted transition-colors group-hover:bg-ink group-hover:text-white"><ArrowUpRight size={16} /></Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

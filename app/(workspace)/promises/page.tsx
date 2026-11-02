import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { EmptyState, PageHeader, RowLink, StatusBadge, Tabs, formatDate } from "@/components/ui";
import { getSessionContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { daysBetween, formatMoney } from "@/lib/domain/money";
import type { PromiseStatus } from "@/lib/domain/types";

export const metadata: Metadata = { title: "Pay dates" };
export const dynamic = "force-dynamic";

const VIEWS: Array<{ key: PromiseStatus; label: string }> = [{ key: "active", label: "Coming up" }, { key: "missed", label: "Missed" }, { key: "fulfilled", label: "Paid on time" }, { key: "cancelled", label: "Replaced" }];

export default async function PromisesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { companyId } = await getSessionContext();
  const view = VIEWS.find((item) => item.key === status)?.key ?? "active";
  const all = await repository.listPromiseItems(companyId);
  const items = all.filter((item) => item.status === view);
  const today = await repository.today(companyId);
  const total = items.reduce((sum, item) => sum + (item.promisedAmount ?? item.amountOutstanding), 0);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Pay dates" title="When customers said they'd pay." muted="Ticked only when the money reaches your bank." />
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-3 pt-1">
          <Tabs active={view} items={VIEWS.map((item) => ({ key: item.key, label: item.label, href: item.key === "active" ? "/promises" : `/promises?status=${item.key}`, count: all.filter((promise) => promise.status === item.key).length }))} />
          <p className="tabular px-2 pb-3 text-[13px] text-muted">{formatMoney(total)} expected in this tab</p>
        </div>
        {items.length === 0 ? <EmptyState icon={CalendarCheck} title="No pay dates here" body="When a customer replies with a date, it shows up here." /> : (
          <div className="scrollbar overflow-x-auto">
            <table className="table-base min-w-[760px]">
              <thead><tr><th scope="col">Customer · bill</th><th scope="col">Pay date</th><th scope="col" className="text-right">Amount said</th><th scope="col" className="text-right">Still unpaid</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {items.map((item) => {
                  const delta = item.promisedDate >= today ? `in ${daysBetween(today, new Date(`${item.promisedDate}T00:00:00Z`))}d` : `${daysBetween(item.promisedDate, new Date(`${today}T00:00:00Z`))}d ago`;
                  return (
                    <tr key={item.id} className="group">
                      <td><span className="block font-medium">{item.customerName}</span><span className="font-mono text-[11.5px] text-muted">{item.invoiceNumber}</span></td>
                      <td className="tabular">{formatDate(item.promisedDate)} <span className="text-[12px] text-muted">· {delta}</span></td>
                      <td className="tabular text-right font-medium">{formatMoney(item.promisedAmount ?? item.amountOutstanding)}</td>
                      <td className="tabular text-right text-muted">{formatMoney(item.amountOutstanding)}</td>
                      <td><StatusBadge value={item.status} label={item.status === "active" ? "coming up" : undefined} /></td>
                      <td className="w-12 text-right">{item.collectionCaseId && <RowLink href={`/cases/${item.collectionCaseId}`} label={`Open case for ${item.invoiceNumber}`} />}</td>
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

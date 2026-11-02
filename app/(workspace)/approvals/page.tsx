import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { ApprovalButtons } from "@/components/approval-buttons";
import { EmptyState, PageHeader, RowLink, StatusBadge, Tabs, formatDate } from "@/components/ui";
import { getSessionContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { formatMoney } from "@/lib/domain/money";

export const metadata: Metadata = { title: "Needs you" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const { companyId } = await getSessionContext();
  const decided = view === "decided";
  const waiting = await repository.listApprovals(companyId);
  const history = await repository.listApprovals(companyId, "decided");
  const items = decided ? history : waiting;
  const atStake = waiting.reduce((total, item) => total + item.amountOutstanding, 0);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Needs you" title="Only you can decide these." muted={waiting.length ? `${waiting.length} waiting · ${formatMoney(atStake, "INR", true)} at stake` : "Nothing waiting right now."} />
      <div className="panel overflow-hidden">
        <div className="border-b border-line px-3 pt-1">
          <Tabs active={decided ? "decided" : "waiting"} items={[{ key: "waiting", label: "Waiting for you", href: "/approvals", count: waiting.length }, { key: "decided", label: "Already decided", href: "/approvals?view=decided", count: history.length }]} />
        </div>
        {items.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={decided ? "Nothing decided yet" : "Nothing waiting for you"} body={decided ? "Every yes and no shows up here, with who made it." : "Late bills, disputes and payment-plan requests will wait here for your yes."} />
        ) : (
          <ul className="stagger-in divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="group grid gap-4 px-5 py-5 transition-colors hover:bg-[#fafbfc] sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_200px_auto] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={item.status} />
                    <span className="eyebrow">{item.actionType.replaceAll("_", " ")}</span>
                  </div>
                  <p className="mt-2 text-[15px] font-medium tracking-[-0.015em]">{item.customerName} <span className="font-mono text-[12px] font-normal text-muted">· {item.invoiceNumber}</span></p>
                  <p className="mt-1 text-[13px] leading-5 text-muted">{item.reason}</p>
                </div>
                <div className="sm:text-right">
                  <p className="tabular text-[17px] font-medium tracking-[-0.02em]">{formatMoney(item.amountOutstanding, item.currency)}</p>
                  <p className="mt-0.5 whitespace-nowrap text-[12px] text-muted">unpaid · raised {formatDate(item.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 sm:col-span-2 xl:col-span-1">
                  {item.status === "awaiting_approval" ? <ApprovalButtons actionId={item.id} size="sm" /> : <span className="text-[12.5px] text-muted">by {item.approvedBy}</span>}
                  <RowLink href={`/cases/${item.collectionCaseId}`} label={`Open case for ${item.invoiceNumber}`} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

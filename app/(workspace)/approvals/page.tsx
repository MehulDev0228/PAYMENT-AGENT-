import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { ApprovalButtons } from "@/components/approval-buttons";
import { EmptyState, PageHeader, StatusBadge, Tabs, formatDate } from "@/components/ui";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { formatMoney } from "@/lib/domain/money";

export const metadata: Metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const { companyId } = getRequestContext();
  const decided = view === "decided";
  const waiting = repository.listApprovals(companyId);
  const history = repository.listApprovals(companyId, "decided");
  const items = decided ? history : waiting;
  const atStake = waiting.reduce((total, item) => total + item.amountOutstanding, 0);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Human in the loop" title="Decisions only you can make." muted={`${waiting.length} waiting · ${formatMoney(atStake, "INR", true)} at stake`} />
      <div className="panel overflow-hidden">
        <div className="border-b border-line px-3 pt-1">
          <Tabs active={decided ? "decided" : "waiting"} items={[{ key: "waiting", label: "Waiting", href: "/approvals", count: waiting.length }, { key: "decided", label: "Decided", href: "/approvals?view=decided", count: history.length }]} />
        </div>
        {items.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={decided ? "No decisions recorded yet" : "Nothing waiting for you"} body={decided ? "Approvals and rejections appear here with who made them." : "AERA will queue escalations, disputes and payment-plan requests here."} />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_160px_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={item.status} />
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{item.actionType.replaceAll("_", " ")}</span>
                  </div>
                  <p className="mt-2 text-[15px] font-medium tracking-[-0.015em]">{item.customerName} <span className="font-mono text-[12px] font-normal text-muted">· {item.invoiceNumber}</span></p>
                  <p className="mt-1 text-[13px] leading-5 text-muted">{item.reason}</p>
                </div>
                <div className="lg:text-right">
                  <p className="tabular text-[17px] font-medium tracking-[-0.02em]">{formatMoney(item.amountOutstanding, item.currency)}</p>
                  <p className="mt-0.5 text-[12px] text-muted">outstanding · raised {formatDate(item.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {item.status === "awaiting_approval" ? <ApprovalButtons actionId={item.id} size="sm" /> : <span className="text-[12.5px] text-muted">by {item.approvedBy}</span>}
                  <Link href={`/cases/${item.collectionCaseId}`} aria-label={`Open case for ${item.invoiceNumber}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"><ArrowUpRight size={16} /></Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

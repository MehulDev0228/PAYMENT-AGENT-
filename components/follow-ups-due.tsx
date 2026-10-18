import Link from "next/link";
import { ArrowUpRight, PhoneCall } from "lucide-react";
import { CALL_OUTCOME_LABELS } from "@/lib/domain/collector";
import { formatMoney } from "@/lib/domain/money";
import type { FollowUpDueItem } from "@/lib/domain/types";
import { EmptyState, cx } from "./ui";

/** Calls collectors planned for today, plus the ones already late. The current user's own come first. */
export function FollowUpsDue({ items, currentUserId }: { items: FollowUpDueItem[]; currentUserId: string }) {
  if (items.length === 0) return <EmptyState icon={PhoneCall} title="No follow-ups due today" body="Calls planned on a case show up here on their date." />;
  const ordered = [...items].sort((a, b) => Number(b.case.assignedTo === currentUserId) - Number(a.case.assignedTo === currentUserId));
  return (
    <ul className="divide-y divide-line/70">
      {ordered.map(({ case: item, followUp, daysLate }) => (
        <li key={item.id}>
          <Link href={`/cases/${item.id}`} className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-[#fafbfc]">
            <span className={cx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", daysLate > 0 ? "bg-[#fdecea] text-danger" : "bg-lime text-lime-ink")}><PhoneCall size={14} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[13.5px] font-medium">{item.customer.name} <span className="font-mono text-[11.5px] font-normal text-muted">{item.invoice.invoiceNumber}</span></p>
                <span className={cx("tabular shrink-0 font-mono text-[10.5px]", daysLate > 0 ? "text-danger" : "text-muted")}>{daysLate > 0 ? `${daysLate}d late` : "today"}</span>
              </div>
              <p className="mt-0.5 truncate text-[13px] text-muted">
                {CALL_OUTCOME_LABELS[followUp.outcome]}{followUp.note ? ` · ${followUp.note}` : ""}
              </p>
              <p className="mt-1 text-[12px] text-muted">
                <span className="tabular font-medium text-ink">{formatMoney(item.invoice.amountOutstanding, item.invoice.currency)}</span>
                {" · "}{item.assignedTo === currentUserId ? <span className="font-medium text-ink">You</span> : item.assigneeName ?? "Unassigned"}
              </p>
            </div>
            <ArrowUpRight size={15} className="mt-1 shrink-0 text-muted/60 transition-colors group-hover:text-ink" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

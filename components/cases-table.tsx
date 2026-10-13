import Link from "next/link";
import { ArrowUpRight, ListChecks } from "lucide-react";
import type { CaseListItem } from "@/lib/domain/types";
import { formatMoney } from "@/lib/domain/money";
import { EmptyState, StatusBadge, cx, formatDate } from "./ui";

export function CasesTable({ cases, compact = false }: { cases: CaseListItem[]; compact?: boolean }) {
  if (cases.length === 0) return <EmptyState icon={ListChecks} title="No cases in this view" body="Try another view or clear the search." />;
  return (
    <div className="scrollbar overflow-x-auto">
      <table className={cx("table-base", compact ? "min-w-[680px]" : "min-w-[960px]")}>
        <thead>
          <tr>
            <th scope="col">Customer · invoice</th>
            <th scope="col" className="text-right">Outstanding</th>
            {!compact && <th scope="col">Due</th>}
            <th scope="col" className="text-right">Overdue</th>
            <th scope="col">Status</th>
            {!compact && <th scope="col">Priority</th>}
            {!compact && <th scope="col">Next action</th>}
            <th scope="col"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {cases.map((item) => (
            <tr key={item.id} className="group">
              <td>
                <Link href={`/cases/${item.id}`} className="block min-w-0">
                  <span className="block truncate font-medium text-ink">{item.customer.name}</span>
                  <span className="mt-0.5 block font-mono text-[11.5px] text-muted">{item.invoice.invoiceNumber}</span>
                </Link>
              </td>
              <td className="tabular text-right font-medium">{formatMoney(item.invoice.amountOutstanding, item.invoice.currency)}</td>
              {!compact && <td className="tabular text-muted">{formatDate(item.invoice.dueDate)}</td>}
              <td className="tabular text-right"><span className={item.daysOverdue >= 30 ? "font-medium text-danger" : item.daysOverdue >= 15 ? "text-warning" : "text-muted"}>{item.daysOverdue}d</span></td>
              <td><StatusBadge value={item.status} /></td>
              {!compact && <td><StatusBadge value={item.priority} /></td>}
              {!compact && <td className="max-w-[240px] truncate text-[13px] text-muted">{item.nextAction}</td>}
              <td className="w-12 text-right">
                <Link aria-label={`Open case for ${item.invoice.invoiceNumber}`} href={`/cases/${item.id}`} className="inline-grid size-9 place-items-center rounded-lg text-muted transition-colors group-hover:bg-ink group-hover:text-white"><ArrowUpRight size={16} /></Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

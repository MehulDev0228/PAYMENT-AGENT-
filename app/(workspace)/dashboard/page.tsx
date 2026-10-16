import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Banknote, CalendarClock, FileWarning, WalletCards } from "lucide-react";
import { ActivityFeed } from "@/components/activity-feed";
import { CasesTable } from "@/components/cases-table";
import { PageHeader, SectionTitle, StatTile, TextLink, formatDate } from "@/components/ui";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { OPEN_CASE_STATUSES } from "@/lib/domain/case-views";
import { formatMoney } from "@/lib/domain/money";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { companyId } = getRequestContext();
  const today = await repository.today(companyId);
  const overview = await repository.overview(companyId);
  const priorityCases = (await repository.listCases(companyId, { statuses: OPEN_CASE_STATUSES })).slice(0, 8);
  const approvals = await repository.listApprovals(companyId);
  const horizon = new Date(`${today}T00:00:00Z`); horizon.setUTCDate(horizon.getUTCDate() + 3);
  const promisesDue = (await repository.listPromiseItems(companyId, "active")).filter((item) => item.promisedDate <= horizon.toISOString().slice(0, 10));
  const review = await repository.listPayments(companyId, "payment_match_review_required");
  const maxAging = Math.max(1, ...overview.aging.map((item) => item.amount));
  const overdueShare = overview.totalOutstanding ? Math.round((overview.totalOverdue / overview.totalOutstanding) * 100) : 0;

  const agenda = [
    { label: "Decisions waiting", value: approvals.length, helper: `${formatMoney(approvals.reduce((s, a) => s + a.amountOutstanding, 0), "INR", true)} at stake`, href: "/approvals" },
    { label: "Promises due ≤ 3 days", value: promisesDue.length, helper: promisesDue[0] ? `Next: ${promisesDue[0].customerName}` : "Nothing due soon", href: "/promises" },
    { label: "Payments to match", value: review.length, helper: review.length ? "Ambiguous bank entries" : "Bank feed is clean", href: "/payments" },
    { label: "Missed promises", value: overview.missedPromiseCount, helper: "Escalated for review", href: "/promises?status=missed" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Overview · ${formatDate(today)}`} title="Receivables, today." muted="The routine is handled. Here's what needs you."
        actions={<><Link href="/automation" className="btn-outline">Run automation</Link><Link href="/approvals" className="btn-primary">Review decisions <span className="tabular rounded-md bg-white/15 px-1.5 font-mono text-[11px]">{approvals.length}</span></Link></>} />

      <section aria-label="Today's agenda" className="relative overflow-hidden rounded-2xl bg-ink p-2 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_0%_0%,rgb(63_226_157/0.18),transparent_60%)]" aria-hidden="true" />
        <div className="relative grid grid-cols-2 gap-2 xl:grid-cols-4">
          {agenda.map((item) => (
            <Link key={item.label} href={item.href} className="group min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3.5 transition-colors hover:bg-white/[0.07] sm:p-4">
              <div className="flex items-center justify-between">
                <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-white/50 sm:text-[10.5px]">{item.label}</p>
                <ArrowUpRight size={15} className="text-white/30 transition-colors group-hover:text-glow" aria-hidden="true" />
              </div>
              <p className="tabular mt-3 text-[28px] font-medium leading-none tracking-[-0.04em] sm:mt-4 sm:text-[34px]">{item.value}</p>
              <p className="mt-2 truncate text-[12.5px] text-white/55">{item.helper}</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Key collection metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Outstanding" value={formatMoney(overview.totalOutstanding, "INR", true)} helper={`${overview.activeCaseCount} open collection cases`} icon={WalletCards} />
        <StatTile label="Overdue" value={formatMoney(overview.totalOverdue, "INR", true)} helper={`${overdueShare}% of book · ${overview.overdueInvoiceCount} invoices`} icon={FileWarning} accent="danger" />
        <StatTile label="Due in 7 days" value={formatMoney(overview.dueThisWeek, "INR", true)} helper="Upcoming, not yet overdue" icon={CalendarClock} accent="warning" />
        <StatTile label="Collected this month" value={formatMoney(overview.collectedThisMonth, "INR", true)} helper="Matched to invoices" icon={Banknote} accent="success" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <article className="panel min-w-0 overflow-hidden">
          <SectionTitle title="Priority cases" helper="Ranked by priority, age and exposure" action={<TextLink href="/cases">All cases <ArrowUpRight size={14} /></TextLink>} />
          <CasesTable cases={priorityCases} compact />
        </article>
        <div className="space-y-6">
          <article className="panel p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[15px] font-medium tracking-[-0.02em]">Aging exposure</h2>
                <p className="mt-0.5 text-[13px] text-muted">Outstanding balance by days past due</p>
              </div>
              <p className="eyebrow">INR</p>
            </div>
            <dl className="mt-6 space-y-4">
              {overview.aging.map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                    <dt className="text-ink">{item.label} <span className="tabular text-muted">· {item.count}</span></dt>
                    <dd className="tabular font-medium">{formatMoney(item.amount, "INR", true)}</dd>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-canvas">
                    <div className={`h-full rounded-full ${item.label === "30+ days" ? "bg-danger" : item.label === "Current" ? "bg-ink" : "bg-brand"}`} style={{ width: `${Math.max(2, (item.amount / maxAging) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </dl>
          </article>
          <article className="panel overflow-hidden">
            <SectionTitle title="Recent activity" helper="From the audit log" />
            <ActivityFeed events={await repository.listAudit(companyId, { limit: 6 })} empty="Nothing has happened yet today" />
          </article>
        </div>
      </section>
    </div>
  );
}

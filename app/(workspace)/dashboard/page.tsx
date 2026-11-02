import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Banknote, CalendarClock, FileWarning, WalletCards } from "lucide-react";
import { ActivityFeed } from "@/components/activity-feed";
import { CasesTable } from "@/components/cases-table";
import { GettingStarted } from "@/components/getting-started";
import { CountUp } from "@/components/motion";
import { PageHeader, SectionTitle, StatTile, TextLink, formatDate } from "@/components/ui";
import { getSessionContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { OPEN_CASE_STATUSES } from "@/lib/domain/case-views";
import { formatMoney } from "@/lib/domain/money";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { companyId } = await getSessionContext();
  const today = await repository.today(companyId);
  const overview = await repository.overview(companyId);
  const priorityCases = (await repository.listCases(companyId, { statuses: OPEN_CASE_STATUSES })).slice(0, 8);
  const approvals = await repository.listApprovals(companyId);
  const horizon = new Date(`${today}T00:00:00Z`); horizon.setUTCDate(horizon.getUTCDate() + 3);
  const promisesDue = (await repository.listPromiseItems(companyId, "active")).filter((item) => item.promisedDate <= horizon.toISOString().slice(0, 10));
  const review = await repository.listPayments(companyId, "payment_match_review_required");
  const maxAging = Math.max(1, ...overview.aging.map((item) => item.amount));
  const overdueShare = overview.totalOutstanding ? Math.round((overview.totalOverdue / overview.totalOutstanding) * 100) : 0;
  const empty = (await repository.listCustomers(companyId)).length === 0;

  const agenda = [
    { label: "Needs your yes", value: approvals.length, helper: approvals.length ? `${formatMoney(approvals.reduce((s, a) => s + a.amountOutstanding, 0), "INR", true)} at stake` : "Nothing waiting", href: "/approvals" },
    { label: "Pay dates in 3 days", value: promisesDue.length, helper: promisesDue[0] ? `Next: ${promisesDue[0].customerName}` : "None coming up", href: "/promises" },
    { label: "Payments to check", value: review.length, helper: review.length ? "Could fit more than one bill" : "Everything matched", href: "/payments" },
    { label: "Missed pay dates", value: overview.missedPromiseCount, helper: overview.missedPromiseCount ? "Flagged for a call" : "None missed", href: "/promises?status=missed" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Today · ${formatDate(today)}`} title="Your money, today." muted="Reminders are handled. Here's what needs you."
        actions={<><Link href="/automation" className="btn-outline">Run daily check</Link><Link href="/approvals" className="btn-primary">Needs you <span className="tabular rounded-md bg-white/15 px-1.5 font-mono text-[11px]">{approvals.length}</span></Link></>} />

      {empty && <GettingStarted />}

      <section aria-label="Today's agenda" data-tour="agenda" className="relative overflow-hidden rounded-2xl bg-ink p-2 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_0%_0%,rgb(63_226_157/0.18),transparent_60%)]" aria-hidden="true" />
        <div className="relative grid grid-cols-2 gap-2 xl:grid-cols-4">
          {agenda.map((item) => (
            <Link key={item.label} href={item.href} className="group min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3.5 transition-colors hover:bg-white/[0.07] sm:p-4">
              <div className="flex items-center justify-between">
                <p className="eyebrow truncate text-[10px] text-white/50 sm:text-[10.5px]">{item.label}</p>
                <ArrowUpRight size={15} className="text-white/30 transition-[color,transform] duration-200 group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-glow" aria-hidden="true" />
              </div>
              <p className="mt-3 text-[28px] font-medium leading-none tracking-[-0.04em] sm:mt-4 sm:text-[34px]"><CountUp value={String(item.value)} /></p>
              <p className="mt-2 truncate text-[12.5px] text-white/55">{item.helper}</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Key collection metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total unpaid" value={formatMoney(overview.totalOutstanding, "INR", true)} helper={`${overview.activeCaseCount} unpaid bills being followed up`} icon={WalletCards} />
        <StatTile label="Overdue" value={formatMoney(overview.totalOverdue, "INR", true)} helper={`${overdueShare}% of what you're owed · ${overview.overdueInvoiceCount} bills`} icon={FileWarning} accent="danger" />
        <StatTile label="Due in 7 days" value={formatMoney(overview.dueThisWeek, "INR", true)} helper="Not late yet" icon={CalendarClock} accent="warning" />
        <StatTile label="Collected this month" value={formatMoney(overview.collectedThisMonth, "INR", true)} helper="Matched to bills" icon={Banknote} accent="success" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <article className="panel min-w-0 overflow-hidden">
          <SectionTitle title="Chase these first" helper="Most urgent unpaid bills" action={<TextLink href="/cases">All unpaid bills <ArrowUpRight size={14} /></TextLink>} />
          <CasesTable cases={priorityCases} compact />
        </article>
        <div className="space-y-6">
          <article className="panel overflow-hidden">
            <SectionTitle title="How late" helper="Unpaid amount by days past the due date" action={<p className="eyebrow">INR</p>} />
            <dl className="space-y-4 p-5">
              {overview.aging.map((item, index) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                    <dt className="text-ink">{item.label} <span className="tabular text-muted">· {item.count}</span></dt>
                    <dd className="tabular font-medium">{formatMoney(item.amount, "INR", true)}</dd>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-canvas">
                    <div className={`bar-grow h-full rounded-full ${item.label === "30+ days" ? "bg-danger" : item.label === "Current" ? "bg-ink" : "bg-brand"}`} style={{ width: `${Math.max(2, (item.amount / maxAging) * 100)}%`, "--i": index } as React.CSSProperties} />
                  </div>
                </div>
              ))}
            </dl>
          </article>
          <article className="panel overflow-hidden">
            <SectionTitle title="What just happened" helper="Every action, with its reason" />
            <ActivityFeed events={await repository.listAudit(companyId, { limit: 6 })} empty="Nothing has happened yet today" />
          </article>
        </div>
      </section>
    </div>
  );
}

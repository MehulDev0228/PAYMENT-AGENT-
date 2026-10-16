import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, CheckCircle2, Cog, Flag, Mail, MessageSquareReply, UserRound } from "lucide-react";
import { ApprovalButtons } from "@/components/approval-buttons";
import { humanizeEvent } from "@/components/activity-feed";
import { StatusBadge, cx, formatDate } from "@/components/ui";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { formatMoney } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const item = await repository.getCase(getRequestContext().companyId, id);
  return { title: item ? `${item.invoice.invoiceNumber} · ${item.customer.name}` : "Case" };
}

type TimelineEvent = { at: string; title: string; detail?: string; kind: "system" | "outbound" | "inbound" | "aera" | "payment" | "human"; quote?: boolean };
const KIND = {
  system: { icon: Cog, tone: "bg-canvas text-muted border border-line" },
  outbound: { icon: Mail, tone: "bg-[#e9effc] text-info" },
  inbound: { icon: MessageSquareReply, tone: "bg-[#f1ecfd] text-violet" },
  aera: { icon: Bot, tone: "bg-ink text-glow" },
  payment: { icon: CheckCircle2, tone: "bg-brand-soft text-success" },
  human: { icon: UserRound, tone: "bg-lime text-lime-ink" },
} as const;

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { companyId } = getRequestContext();
  const item = await repository.getCase(companyId, id);
  if (!item) notFound();

  const audit = await repository.listAudit(companyId, { entityId: item.id });
  const actionIds = new Set(item.actions.map((action) => action.id));
  const actionAudit = (await repository.listAudit(companyId, { entityType: "collection_action", limit: 500 })).filter((event) => actionIds.has(event.entityId));
  const timeline: TimelineEvent[] = [
    { at: `${item.invoice.invoiceDate}T00:00:00Z`, title: "Invoice issued", detail: `${item.invoice.invoiceNumber} for ${formatMoney(item.invoice.amount, item.invoice.currency)}, due ${formatDate(item.invoice.dueDate)}`, kind: "system" as const },
    { at: `${item.invoice.dueDate}T00:00:00Z`, title: "Invoice fell due", kind: "system" as const },
    ...item.communications.map((message) => ({ at: message.receivedAt || message.processedAt || "", title: message.direction === "outbound" ? `Email sent · ${message.subject}` : `Customer replied · ${message.subject}`, detail: message.body, kind: message.direction, quote: true }) as TimelineEvent),
    ...item.payments.map((payment) => ({ at: `${payment.paymentDate}T09:00:00Z`, title: `Payment received · ${formatMoney(payment.amount)}`, detail: `${payment.paymentReference} · ${payment.matchNotes ?? "matched"}`, kind: "payment" }) as TimelineEvent),
    ...[...audit, ...actionAudit]
      .filter((event) => !["reminder_sent"].includes(event.eventType))
      .map((event) => ({ at: event.createdAt, title: event.eventType === "case_status_changed" ? `Status → ${String(event.dataSnapshot.to).replaceAll("_", " ")}` : humanizeEvent(event.eventType), detail: event.reason, kind: event.actorType === "human" ? "human" : event.actorType === "aera" ? "aera" : "system" }) as TimelineEvent),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const pending = item.actions.filter((action) => action.status === "awaiting_approval");
  const activePromise = item.promises.find((promise) => promise.status === "active");
  const paidShare = item.invoice.amount ? Math.round((item.invoice.amountPaid / item.invoice.amount) * 100) : 0;

  return (
    <div className="space-y-6">
      <Link href="/cases" className="btn-ghost -ml-3"><ArrowLeft size={16} /> All cases</Link>
      <header className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow eyebrow-dot">Case · <span className="normal-case tracking-normal">{item.invoice.invoiceNumber}</span></p>
            <StatusBadge value={item.status} />
            <StatusBadge value={item.priority} />
          </div>
          <h1 className="title mt-3">{item.customer.name}<span className="title-muted block">{item.daysOverdue} days overdue · owner {item.assignedTo ?? "unassigned"}</span></h1>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-ink p-5 text-white">
          <div className="pointer-events-none absolute -right-10 -top-16 size-40 rounded-full bg-glow/25 blur-3xl" aria-hidden="true" />
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/50">Outstanding</p>
          <p className="tabular mt-3 text-[34px] font-medium leading-none tracking-[-0.04em]">{formatMoney(item.invoice.amountOutstanding, item.invoice.currency)}</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-glow" style={{ width: `${paidShare}%` }} /></div>
          <p className="tabular mt-2 text-[12.5px] text-white/55">{paidShare}% paid of {formatMoney(item.invoice.amount, item.invoice.currency)}</p>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="panel p-5 md:p-7">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">The paper trail</p>
              <h2 className="mt-2 text-lg font-medium tracking-[-0.03em]">Every step, with its reason.</h2>
            </div>
            <span className="tabular font-mono text-[11px] text-muted">{timeline.length} events</span>
          </div>
          <ol className="relative">
            {timeline.map((event, index) => {
              const { icon: Icon, tone } = KIND[event.kind];
              return (
                <li key={`${event.at}-${index}`} className="relative flex gap-4 pb-7 last:pb-0">
                  {index < timeline.length - 1 && <span className="absolute left-[15px] top-9 h-[calc(100%-36px)] w-px bg-line" aria-hidden="true" />}
                  <span className={cx("relative z-10 grid size-8 shrink-0 place-items-center rounded-[10px]", tone)}><Icon size={15} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <h3 className="text-[14px] font-medium">{event.title}</h3>
                      <time className="tabular font-mono text-[10.5px] text-muted">{formatDate(event.at, !event.at.includes("T00:00:00"))}</time>
                    </div>
                    {event.detail && (event.quote
                      ? <p className="mt-2 whitespace-pre-line rounded-xl border border-line bg-canvas px-4 py-3 text-[13.5px] leading-6 text-ink/80">{event.detail}</p>
                      : <p className="mt-1 text-[13px] leading-5 text-muted">{event.detail}</p>)}
                  </div>
                </li>
              );
            })}
          </ol>
        </article>

        <aside className="space-y-4">
          {pending.map((action) => (
            <article key={action.id} className="rounded-2xl border border-[#f0d79a] bg-[#fdf7e6] p-5">
              <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#8a5304]"><Flag size={13} aria-hidden="true" /> Your decision</p>
              <h2 className="mt-3 text-[15px] font-medium leading-snug text-ink">{action.message}</h2>
              <p className="mb-4 mt-1.5 text-[13px] leading-5 text-[#6b4a10]">{action.reason}</p>
              <ApprovalButtons actionId={action.id} />
            </article>
          ))}

          <article className="rounded-2xl bg-lime p-5 text-lime-ink">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] opacity-70">Next move</p>
            <p className="mt-3 text-[19px] font-medium leading-tight tracking-[-0.03em]">{item.nextAction}</p>
            <p className="mt-3 text-[12.5px] opacity-75">{item.nextActionAt ? `Scheduled ${formatDate(item.nextActionAt)}` : "Not scheduled"}</p>
          </article>

          {activePromise && (
            <article className="panel p-5">
              <p className="eyebrow">Active promise</p>
              <p className="tabular mt-3 text-[22px] font-medium tracking-[-0.03em]">{formatMoney(activePromise.promisedAmount ?? item.invoice.amountOutstanding)}</p>
              <p className="mt-1 text-[13px] text-muted">by {formatDate(activePromise.promisedDate)} · verified against the bank feed, not the customer&apos;s word</p>
            </article>
          )}

          <article className="panel p-5">
            <p className="eyebrow">Verified facts</p>
            <dl className="mt-4 space-y-3 text-[13px]">
              {[["Invoice", item.invoice.invoiceNumber], ["Issued", formatDate(item.invoice.invoiceDate)], ["Due", formatDate(item.invoice.dueDate)], ["Currency", item.invoice.currency], ["Customer code", item.customer.customerCode], ["Billing email", item.customer.email], ["Account manager", item.customer.accountManager || "—"]].map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4 border-b border-line/70 pb-3 last:border-0 last:pb-0">
                  <dt className="text-muted">{key}</dt>
                  <dd className="truncate text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <Link href={`/customers/${item.customerId}`} className="btn-outline btn-sm mt-4 w-full">Customer account</Link>
          </article>
        </aside>
      </section>
    </div>
  );
}

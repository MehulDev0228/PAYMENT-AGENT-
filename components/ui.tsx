import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect width="28" height="28" rx="8" fill="currentColor" />
      <path d="M8.5 19.5 14 8.5l5.5 11" fill="none" stroke="var(--logo-ink, #0a0c10)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 15.2h6" stroke="var(--logo-ink, #0a0c10)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="21.5" cy="6.5" r="2.5" fill="var(--glow)" />
    </svg>
  );
}

export function Logo({ tone = "light", href = "/" }: { tone?: "light" | "dark"; href?: string }) {
  return (
    <Link href={href} className={cx("flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.04em]", tone === "light" ? "text-white" : "text-ink")} aria-label="AERA home">
      <span className={tone === "light" ? "text-white [--logo-ink:#0a0c10]" : "text-ink [--logo-ink:#ffffff]"}><LogoMark /></span>
      aera
    </Link>
  );
}

export function PageHeader({ eyebrow, title, muted, actions, children }: { eyebrow: string; title: string; muted?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="eyebrow eyebrow-dot">{eyebrow}</p>
        <h1 className="title mt-3">
          {title}
          {muted && <span className="title-muted block">{muted}</span>}
        </h1>
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const STATUS_TONES: Record<string, string> = {
  closed: "success", payment_received: "success", paid: "success", fulfilled: "success", matched: "success", executed: "success", approved: "success",
  escalated: "danger", promise_missed: "danger", missed: "danger", critical: "danger", rejected: "neutral", failed: "danger", unmatched: "danger",
  payment_promised: "violet", active: "violet", high: "orange",
  reminder_sent: "info", customer_replied: "info", reminder_pending: "warning", awaiting_approval: "warning", medium: "warning", payment_match_review_required: "warning", pending: "warning",
  overdue: "orange", low: "neutral", cancelled: "neutral",
};
const TONE_CLASSES: Record<string, string> = {
  success: "bg-[#e7f6ee] text-[#05663f] [--dot:#0a8f5f]",
  danger: "bg-[#fdecea] text-[#a3241a] [--dot:#d93a2b]",
  violet: "bg-[#f1ecfd] text-[#5531b3] [--dot:#7c55e0]",
  orange: "bg-[#fdf0e4] text-[#9a4a06] [--dot:#e2771d]",
  info: "bg-[#e9effc] text-[#24499f] [--dot:#3a6be0]",
  warning: "bg-[#fdf5df] text-[#8a5304] [--dot:#d99a0b]",
  neutral: "bg-[#eef0f3] text-[#4a515d] [--dot:#8a919e]",
};
const STATUS_LABELS: Record<string, string> = { payment_match_review_required: "needs review", awaiting_approval: "awaiting approval" };

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const tone = TONE_CLASSES[STATUS_TONES[value] ?? "neutral"];
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-2 pr-2.5 text-[11.5px] font-medium capitalize leading-none", tone, className)}>
      <span className="size-1.5 rounded-full bg-[var(--dot)]" aria-hidden="true" />
      {STATUS_LABELS[value] ?? value.replaceAll("_", " ")}
    </span>
  );
}

export function StatTile({ label, value, helper, icon: Icon, accent }: { label: string; value: string; helper?: ReactNode; icon?: LucideIcon; accent?: "danger" | "success" | "warning" | "brand" }) {
  const accentClass = { danger: "text-danger", success: "text-success", warning: "text-warning", brand: "text-brand" }[accent ?? "brand"];
  return (
    <article className="panel min-w-0 p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{label}</p>
        {Icon && <Icon size={16} className={accentClass} aria-hidden="true" />}
      </div>
      <p className="tabular mt-5 text-[30px] font-medium leading-none tracking-[-0.04em] text-ink">{value}</p>
      {helper && <p className="mt-2.5 text-[13px] text-muted">{helper}</p>}
    </article>
  );
}

export function SectionTitle({ title, helper, action }: { title: string; helper?: string; action?: ReactNode }) {
  return (
    <div className="panel-head">
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium tracking-[-0.02em]">{title}</h2>
        {helper && <p className="mt-0.5 truncate text-[13px] text-muted">{helper}</p>}
      </div>
      {action}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-ink transition-colors hover:bg-black/[0.04]">{children}</Link>;
}

export function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-xl border border-line bg-canvas text-muted"><Icon size={19} aria-hidden="true" /></span>
      <p className="mt-4 text-sm font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] leading-5 text-muted">{body}</p>}
    </div>
  );
}

export function Tabs({ items, active }: { items: Array<{ key: string; label: string; href: string; count?: number }>; active: string }) {
  return (
    <nav aria-label="Views" className="scrollbar -mb-px flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link key={item.key} href={item.href} aria-current={isActive ? "page" : undefined}
            className={cx("relative inline-flex min-h-11 shrink-0 items-center gap-2 px-3 text-sm transition-colors", isActive ? "font-medium text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-ink" : "text-muted hover:text-ink")}>
            {item.label}
            {item.count !== undefined && <span className={cx("tabular rounded-md px-1.5 py-0.5 font-mono text-[10.5px]", isActive ? "bg-ink text-white" : "bg-black/[0.05] text-muted")}>{item.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function Pagination({ page, pageCount, hrefFor, total, label }: { page: number; pageCount: number; hrefFor: (page: number) => string; total: number; label: string }) {
  if (pageCount <= 1) return <p className="border-t border-line px-5 py-3 text-[13px] text-muted">{total} {label}</p>;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-muted">
      <span className="tabular">Page {page} of {pageCount} · {total} {label}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="btn-outline btn-sm" href={hrefFor(page - 1)}>Previous</Link> : <span className="btn-outline btn-sm opacity-40">Previous</span>}
        {page < pageCount ? <Link className="btn-outline btn-sm" href={hrefFor(page + 1)}>Next</Link> : <span className="btn-outline btn-sm opacity-40">Next</span>}
      </div>
    </div>
  );
}

export function formatDate(value: string | undefined, withTime = false) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: withTime ? "Asia/Kolkata" : "UTC" });
}

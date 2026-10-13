import Link from "next/link";
import { ArrowRight, ArrowUpRight, Ban, Bot, Check, CheckCircle2, Mail, MessageSquareReply, Plus, X } from "lucide-react";
import { SiteNav } from "@/components/marketing/site-nav";
import { LogoMark, cx, formatDate } from "@/components/ui";
import { repository } from "@/lib/data";
import { DEMO_COMPANY_ID } from "@/lib/data/seed";
import { formatMoney } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

const STEPS = [
  ["Watch every invoice.", "AERA reads your open invoices each morning and measures them against your collection policy. Nothing slips because someone was on leave."],
  ["Write like your team would.", "Routine reminders go out in your tone, built only from verified invoice facts. No invented fees, no threats, no surprises."],
  ["Hear what customers say.", "Replies are read and classified. A promise to pay becomes a dated record. A dispute or a plan request goes straight to a person."],
  ["Prove it with the bank.", "Bank files are matched to invoices deterministically. A promise is only kept when the money is, and ambiguous payments wait for review."],
];

const FAQ = [
  ["Does AERA ever decide about money?", "No. Discounts, waivers, payment plans, term changes, disputes, legal steps and account suspension always go to a person. The software has no setting that changes this."],
  ["Where do the numbers come from?", "From your ledger and bank files. Balances, ageing, matching and promise outcomes are computed by deterministic rules. The language model only drafts wording and reads replies."],
  ["Does it send email from our domain?", "Yes, through your own Gmail workspace, connected inside n8n. The app itself never holds your mail credentials."],
  ["What happens when a payment could match two invoices?", "It is held as needs review, with ranked candidates and a reason for each. A reviewer applies it with one click, and the decision is logged."],
  ["Can we see why something happened?", "Every action carries the reason and the data snapshot it was based on, in an append-only audit log your auditors can read."],
];

export default function LandingPage() {
  const overview = repository.overview(DEMO_COMPANY_ID);
  const approvals = repository.listActions(DEMO_COMPANY_ID, "awaiting_approval").length;
  const showcase = repository.listCases(DEMO_COMPANY_ID, { q: "INV-1042" }).find((item) => item.invoice.invoiceNumber === "INV-1042");
  const maxAging = Math.max(1, ...overview.aging.map((item) => item.amount));

  return (
    <div className="bg-ink text-white">
      <SiteNav />
      <main id="main">
        {/* ------------------------------------------------------------- hero */}
        <section className="hero-field relative overflow-hidden pb-20 pt-36 md:pb-28 md:pt-44">
          <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
          <svg className="pointer-events-none absolute inset-x-0 top-40 w-full opacity-30" viewBox="0 0 1440 400" fill="none" aria-hidden="true" preserveAspectRatio="none">
            <path d="M-20 360C320 120 760 60 1460 140" stroke="white" strokeOpacity=".5" />
            <path d="M-20 300C420 40 900 10 1460 70" stroke="white" strokeOpacity=".25" />
          </svg>
          <div className="relative mx-auto max-w-[1180px] px-5 text-center">
            <p className="animate-rise font-mono text-[11px] uppercase tracking-[0.18em] text-white/75"><span className="animate-pulse-dot mr-2 inline-block size-1.5 rounded-full bg-glow align-middle" />Accounts receivable, with guardrails</p>
            <h1 className="display animate-rise mx-auto mt-6 max-w-[1000px] text-[42px] [animation-delay:80ms] sm:text-[58px] lg:text-[80px]">
              <span className="block text-balance">Every invoice followed&nbsp;up.</span>
              <span className="block text-balance text-white/55">Every rupee accounted&nbsp;for.</span>
            </h1>
            <p className="animate-rise mx-auto mt-7 max-w-[560px] text-[16px] leading-7 text-white/80 [animation-delay:160ms] md:text-[17px]">
              AERA watches your receivables, writes to customers, records what they promise and checks it against the bank. Your team only touches the decisions that need judgment.
            </p>
            <div className="animate-rise mt-9 flex flex-wrap items-center justify-center gap-3 [animation-delay:240ms]">
              <Link href="/dashboard" className="btn-light min-h-12 px-5 text-[15px]">Open the live workspace <ArrowRight size={16} /></Link>
              <a href="#how" className="btn min-h-12 border border-white/20 px-5 text-[15px] text-white hover:bg-white/10">See how it works</a>
            </div>

            {/* product moments */}
            <div className="animate-rise relative mx-auto mt-20 grid max-w-[1040px] gap-4 text-left [animation-delay:320ms] md:grid-cols-3 md:gap-5">
              <article className="rounded-2xl border border-white/10 bg-ink-2/90 p-5 shadow-2xl backdrop-blur md:mt-10 md:-rotate-[2.5deg]">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/45"><span>Day 3 · friendly</span><Mail size={13} /></div>
                <p className="mt-5 text-[19px] font-medium leading-tight tracking-[-0.03em]">Reminder sent, in your voice.</p>
                <div className="mt-4 rounded-xl bg-white/[0.04] p-3 text-[12.5px] leading-5 text-white/60">“…invoice INV-1042 for ₹84,000 was due on 20 September. Could you share the expected payment date?”</div>
                <p className="mt-4 flex items-center gap-2 text-[12px] text-white/50"><CheckCircle2 size={13} className="text-glow" /> Built from verified facts only</p>
              </article>
              <article className="rounded-2xl bg-white p-5 text-ink shadow-[0_30px_80px_-20px_rgb(0_0_0/0.55)]">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted"><span>Customer reply</span><MessageSquareReply size={13} /></div>
                <p className="mt-5 text-[26px] font-medium leading-[1.05] tracking-[-0.04em]">“We will pay on Tuesday.”</p>
                <div className="mt-5 flex flex-wrap gap-1.5 font-mono text-[11px]">
                  <span className="rounded-md bg-[#f1ecfd] px-2 py-1 text-violet">payment_promise</span>
                  <span className="rounded-md bg-canvas px-2 py-1 text-muted">confidence 0.96</span>
                </div>
                <div className="mt-5 flex items-center justify-between rounded-xl border border-line p-3">
                  <span className="text-[13px] text-muted">Promise recorded</span>
                  <span className="tabular text-[13px] font-medium">29 Sep 2026</span>
                </div>
              </article>
              <article className="rounded-2xl bg-lime p-5 text-lime-ink shadow-2xl md:mt-10 md:rotate-[2.5deg]">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] opacity-60"><span>Bank import</span><Check size={13} /></div>
                <p className="mt-5 text-[19px] font-medium leading-tight tracking-[-0.03em]">Payment matched. Promise kept. Case closed.</p>
                <div className="mt-4 space-y-2 font-mono text-[11.5px]">
                  <div className="flex justify-between rounded-lg bg-black/[0.06] px-3 py-2"><span>UTR · INV-1042</span><span>₹84,000</span></div>
                  <div className="flex justify-between rounded-lg bg-black/[0.06] px-3 py-2"><span>Match rule</span><span>exact invoice</span></div>
                </div>
              </article>
            </div>

            {/* live strip */}
            <dl className="relative mx-auto mt-16 grid max-w-[1040px] grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-black/20 text-left backdrop-blur md:grid-cols-4">
              {[["Outstanding", formatMoney(overview.totalOutstanding, "INR", true)], ["Overdue", formatMoney(overview.totalOverdue, "INR", true)], ["Active promises", String(overview.activePromiseCount)], ["Waiting for a person", String(approvals)]].map(([label, value], index) => (
                <div key={label} className={cx("p-5", index > 0 && "border-white/10 md:border-l", index > 1 && "border-t md:border-t-0", index === 1 && "border-l")}>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">{label}</dt>
                  <dd className="tabular mt-2 text-[26px] font-medium tracking-[-0.04em]">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/45">Live from the demo ledger · fictional data</p>
          </div>
        </section>

        {/* ---------------------------------------------------------- trust */}
        <section id="product" className="scroll-mt-24 bg-ink py-24 md:py-32">
          <div className="mx-auto max-w-[1180px] px-5">
            <div className="grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-end">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">Why finance teams trust it</p>
                <h2 className="display mt-5 text-[36px] md:text-[54px]">No action from nowhere. <span className="text-white/45">Every step has a reason on record.</span></h2>
              </div>
              <p className="max-w-sm text-[15px] leading-7 text-white/60 md:justify-self-end">The ledger, the conversation, the promise and the decision stay together, so anyone can check why AERA did what it did.</p>
            </div>

            <div className="mt-14 grid gap-4 md:grid-cols-2">
              <BentoCard eyebrow="The ledger" meta="Live" title="Exposure you can read in a glance." body="Ageing, priority and exposure are computed from your invoices. Not estimated, not modelled.">
                <div className="space-y-3">
                  {overview.aging.map((item) => (
                    <div key={item.label} className="grid grid-cols-[86px_minmax(0,1fr)_64px] items-center gap-3 text-[12px]">
                      <span className="text-white/55">{item.label}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><span className={cx("block h-full rounded-full", item.label === "30+ days" ? "bg-[#ff7a66]" : "bg-glow")} style={{ width: `${Math.max(3, (item.amount / maxAging) * 100)}%` }} /></span>
                      <span className="tabular text-right text-white/80">{formatMoney(item.amount, "INR", true)}</span>
                    </div>
                  ))}
                </div>
              </BentoCard>
              <BentoCard eyebrow="The conversation" meta="Classified" title="Replies understood, not improvised." body="A reply is classified into one of eleven intents. What happens next is decided by rules, not by the model.">
                <div className="space-y-2.5">
                  {[["“Payment has been transferred today.”", "payment_completed", "wait for bank"], ["“Can we pay 50% now, rest next month?”", "payment_plan_request", "to a person"], ["“This amount looks incorrect.”", "payment_dispute", "to a person"]].map(([quote, intent, route]) => (
                    <div key={intent} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5">
                      <span className="text-[12.5px] text-white/75">{quote}</span>
                      <span className="flex items-center gap-1.5 font-mono text-[10.5px]"><span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-white/70">{intent}</span><ArrowRight size={11} className="text-white/35" /><span className={route === "to a person" ? "text-[#f5c451]" : "text-glow"}>{route}</span></span>
                    </div>
                  ))}
                </div>
              </BentoCard>
              <BentoCard eyebrow="The promise" meta="Verified" title="A promise is kept when the money is." body="Promised dates are checked against matched payments. Missed ones escalate on their own, with the evidence attached.">
                <div className="grid grid-cols-7 gap-1.5 text-center font-mono text-[10.5px]">
                  {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={index} className="pb-1 text-white/35">{day}</span>)}
                  {Array.from({ length: 14 }, (_, index) => {
                    const day = 21 + index; const label = day > 30 ? day - 30 : day;
                    const promised = day === 29; const today = day === 27;
                    return <span key={day} className={cx("grid aspect-square place-items-center rounded-lg", promised ? "bg-glow font-medium text-ink" : today ? "border border-white/40 text-white" : "bg-white/[0.03] text-white/45")}>{label}</span>;
                  })}
                </div>
              </BentoCard>
              <BentoCard eyebrow="The decision" meta="Human" title="Judgment calls stay with your team." body="Escalations, disputes and plan requests arrive in one approval queue, with the reason and the numbers attached.">
                <div className="rounded-xl bg-white p-4 text-ink">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a5304]">Your decision</p>
                  <p className="mt-2 text-[14px] font-medium leading-snug">Payment plan requested: 50% now, 50% in 30 days.</p>
                  <p className="mt-1 text-[12px] text-muted">Customer reply classified as payment_plan_request · ₹2.4L outstanding</p>
                  <div className="mt-3 flex gap-2"><span className="btn-primary btn-sm pointer-events-none"><Check size={13} /> Approve</span><span className="btn-outline btn-sm pointer-events-none"><X size={13} /> Reject</span></div>
                </div>
              </BentoCard>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ workspace */}
        <section className="bg-canvas py-24 text-ink md:py-32">
          <div className="mx-auto max-w-[1180px] px-5">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="eyebrow">Inside the workspace</p>
                <h2 className="display mt-5 text-[36px] md:text-[54px]">One queue your team can act on. <span className="text-muted">Not another inbox.</span></h2>
              </div>
              <Link href="/dashboard" className="btn-primary min-h-12 shrink-0 px-5">Open the live workspace <ArrowUpRight size={16} /></Link>
            </div>

            {showcase && (
              <div className="mt-12 overflow-hidden rounded-[22px] border border-line bg-[#eceef1] p-2 shadow-[0_40px_100px_-40px_rgb(10_12_16/0.35)]">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex gap-1.5" aria-hidden="true"><span className="size-2.5 rounded-full bg-[#d5d8de]" /><span className="size-2.5 rounded-full bg-[#d5d8de]" /><span className="size-2.5 rounded-full bg-[#d5d8de]" /></div>
                  <span className="font-mono text-[11px] text-muted">aera / cases / {showcase.invoice.invoiceNumber}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Demo data</span>
                </div>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-2xl bg-white p-6">
                    <div className="flex flex-wrap items-center gap-2"><span className="eyebrow">Case</span><span className="rounded-full bg-[#f1ecfd] px-2.5 py-1 text-[11px] font-medium text-violet">payment promised</span></div>
                    <p className="mt-3 text-[24px] font-medium tracking-[-0.035em]">{showcase.customer.name}</p>
                    <ol className="mt-6 space-y-5">
                      {[[Mail, "Reminder sent", "23 Sep · friendly tone, policy step “due”", "bg-[#e9effc] text-info"], [MessageSquareReply, "Customer replied", "25 Sep · “We will pay on Tuesday.”", "bg-[#f1ecfd] text-violet"], [Bot, "Promise recorded", "25 Sep · ₹84,000 on 29 Sep · confidence 0.96", "bg-ink text-glow"], [CheckCircle2, "Waiting on the bank", "Closes automatically when the payment matches", "bg-brand-soft text-success"]].map(([Icon, title, detail, tone]) => {
                        const I = Icon as typeof Mail;
                        return (
                          <li key={String(title)} className="flex gap-3">
                            <span className={cx("grid size-8 shrink-0 place-items-center rounded-[10px]", String(tone))}><I size={15} /></span>
                            <div><p className="text-[14px] font-medium">{String(title)}</p><p className="text-[13px] text-muted">{String(detail)}</p></div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                  <div className="grid gap-2">
                    <div className="rounded-2xl bg-ink p-5 text-white">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">Outstanding</p>
                      <p className="tabular mt-3 text-[30px] font-medium tracking-[-0.04em]">{formatMoney(showcase.invoice.amountOutstanding)}</p>
                      <p className="mt-1 text-[12.5px] text-white/55">Due {formatDate(showcase.invoice.dueDate)}</p>
                    </div>
                    <div className="rounded-2xl bg-lime p-5 text-lime-ink">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-65">Next move</p>
                      <p className="mt-3 text-[20px] font-medium leading-tight tracking-[-0.03em]">Verify promised payment.</p>
                      <p className="mt-2 text-[12.5px] opacity-75">Scheduled 29 Sep 2026</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------- how it works */}
        <section id="how" className="scroll-mt-24 bg-ink py-24 md:py-32">
          <div className="mx-auto grid max-w-[1180px] gap-14 px-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="md:sticky md:top-32 md:self-start">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">How it works</p>
              <h2 className="display mt-5 text-[44px] md:text-[64px]">Monitor. Remind. Reconcile.</h2>
              <p className="mt-6 max-w-sm text-[15px] leading-7 text-white/60">The routine runs every day on its own. The exceptions come to you with the reason attached.</p>
            </div>
            <ol className="divide-y divide-white/10 border-y border-white/10">
              {STEPS.map(([title, body], index) => (
                <li key={title} className="grid grid-cols-[48px_minmax(0,1fr)] gap-4 py-8">
                  <span className="font-mono text-[12px] text-glow">0{index + 1}</span>
                  <div>
                    <h3 className="text-[24px] font-medium tracking-[-0.035em] md:text-[28px]">{title}</h3>
                    <p className="mt-3 max-w-lg text-[15px] leading-7 text-white/60">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* -------------------------------------------------------- controls */}
        <section id="controls" className="scroll-mt-24 bg-canvas py-24 text-ink md:py-32">
          <div className="mx-auto grid max-w-[1180px] gap-12 px-5 md:grid-cols-2">
            <div>
              <p className="eyebrow">Controls</p>
              <h2 className="display mt-5 text-[36px] md:text-[54px]">Built for the audit. <span className="text-muted">Not just the demo.</span></h2>
              <p className="mt-6 max-w-md text-[15px] leading-7 text-muted">Every company is isolated at the database with row-level security. Every action writes the reason and the data it saw to an append-only log.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {["Approve discounts", "Waive balances", "Change payment terms", "Approve payment plans", "Start legal escalation", "Suspend accounts", "Edit financial records", "Close a case on a promise"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-4">
                  <span className="grid size-8 place-items-center rounded-lg bg-[#fdecea] text-danger"><Ban size={15} /></span>
                  <span className="text-[14px]"><span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-muted">AERA never</span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- FAQ */}
        <section id="faq" className="scroll-mt-24 bg-ink py-24 md:py-32">
          <div className="mx-auto grid max-w-[1180px] gap-12 px-5 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">Questions</p>
              <h2 className="display mt-5 text-[36px] md:text-[48px]">Asked by every controller.</h2>
            </div>
            <div className="divide-y divide-white/10 border-y border-white/10">
              {FAQ.map(([question, answer]) => (
                <details key={question} className="group py-1">
                  <summary className="flex min-h-16 items-center justify-between gap-6 text-[16px] font-medium tracking-[-0.015em] [&::-webkit-details-marker]:hidden">
                    {question}
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/20 transition-transform duration-200 group-open:rotate-45"><Plus size={14} /></span>
                  </summary>
                  <p className="max-w-xl pb-6 text-[15px] leading-7 text-white/60">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- CTA */}
        <section className="bg-ink pb-10">
          <div className="mx-auto max-w-[1180px] px-5">
            <Link href="/dashboard" className="group block border-t border-white/10 pt-20">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/45"><span className="animate-pulse-dot mr-2 inline-block size-1.5 rounded-full bg-glow align-middle" />An invoice is falling due somewhere right now</p>
              <div className="mt-6 flex items-end justify-between gap-6">
                <h2 className="display text-[48px] text-white transition-colors group-hover:text-glow sm:text-[72px] lg:text-[112px]">Collect what you&apos;re owed.</h2>
                <ArrowUpRight className="mb-3 size-12 shrink-0 text-white/70 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-glow md:size-20" strokeWidth={1.25} />
              </div>
            </Link>
          </div>
        </section>
      </main>
      <footer className="bg-ink">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6 border-t border-white/10 px-5 py-8 text-[13px] text-white/50 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5 text-white"><span className="[--logo-ink:#0a0c10]"><LogoMark className="size-6" /></span><span className="font-semibold tracking-[-0.04em]">aera</span></div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2"><a href="#how" className="hover:text-white">How it works</a><a href="#controls" className="hover:text-white">Controls</a><Link href="/policy" className="hover:text-white">Policy</Link><Link href="/dashboard" className="hover:text-white">Workspace</Link></nav>
          <p>© 2026 AERA · Demo build with fictional data</p>
        </div>
      </footer>
    </div>
  );
}

function BentoCard({ eyebrow, meta, title, body, children }: { eyebrow: string; meta: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[22px] border border-white/[0.07] bg-ink-2">
      <div className="flex items-center justify-between px-6 pt-5 font-mono text-[10.5px] uppercase tracking-[0.14em]">
        <span className="text-white/50">{eyebrow}</span>
        <span className="text-glow/80">{meta}</span>
      </div>
      <div className="flex min-h-[230px] items-center px-6 py-7"><div className="w-full">{children}</div></div>
      <div className="mt-auto border-t border-white/[0.06] bg-white/[0.015] px-6 py-5">
        <h3 className="text-[20px] font-medium tracking-[-0.03em]">{title}</h3>
        <p className="mt-1.5 text-[14px] leading-6 text-white/55">{body}</p>
      </div>
    </article>
  );
}

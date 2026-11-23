import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban, CalendarCheck, Check, EyeOff, FileUp, HandCoins, MailCheck, ShieldCheck, X } from "lucide-react";
import { TourButton } from "@/components/tour-button";
import { PageHeader, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "How it works" };

const FLOW = [
  { icon: FileUp, title: "You upload your unpaid bills", body: "Four columns: bill number, customer email, amount due, due date. Export them from Tally, Excel or any accounting tool. Any other column in your sheet is ignored and never stored.", href: "/imports", cta: "Upload" },
  { icon: MailCheck, title: "Polite reminders go out on their own", body: "Every day KindlyPay checks how late each bill is and follows your rules: a friendly note on the due date, a firmer one a few days later. Each email uses only that bill's facts.", href: "/automation", cta: "Auto reminders" },
  { icon: CalendarCheck, title: "Customers reply, and dates are saved", body: "“We'll pay on Tuesday” becomes a pay date. A dispute or a request to pay in parts goes straight to “Needs you”, never answered by the software.", href: "/promises", cta: "Pay dates" },
  { icon: HandCoins, title: "The bank confirms it", body: "Upload your bank statement and each payment is matched to its bill. A pay date only counts as kept when the money is actually in. Unclear payments wait for you.", href: "/payments", cta: "Money in" },
  { icon: ShieldCheck, title: "You decide anything about money", body: "Discounts, payment plans, disputes and serious follow-ups all wait in “Needs you” with the reason and numbers attached. One click to say yes or no.", href: "/approvals", cta: "Needs you" },
];

const SEES = ["Bill number", "Customer's billing email", "Amount still due", "Due date"];
const NEVER_SEES = ["Cash sales or your cash book", "Product rates, quantities or discounts you give", "Your full ledger, profit or turnover", "Bills that are already paid"];
const NEVER_DOES = ["Give a discount", "Waive or reduce a balance", "Change payment terms", "Agree to a payment plan", "Threaten or use legal language", "Close a bill on a customer's word"];

const WORDS = [
  ["Unpaid bills", "Every bill a customer still owes you, with what happens next."],
  ["Needs you", "Decisions only a person can make. Nothing here happens without your yes."],
  ["Pay date", "The date a customer said they will pay. Ticked only when money reaches your bank."],
  ["Missed pay date", "The date passed and the money didn't come. Flagged so someone can call."],
  ["Money in", "Payments from your bank statement, each matched to the bill it pays."],
  ["Check match", "A payment that could belong to more than one bill. You pick the right one."],
  ["Call needed", "A bill late enough that a person should pick up the phone."],
  ["Rules", "When reminders go out and how firm they sound. Same for every customer."],
];

export default function GuidePage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="How it works" title="KindlyPay in five steps." muted="Read it once and you know the whole product." actions={<TourButton />} />

      <ol className="stagger-in grid gap-3">
        {FLOW.map(({ icon: Icon, title, body, href, cta }, index) => (
          <li key={title} className="panel group grid gap-4 p-5 transition-colors hover:border-line-strong md:grid-cols-[56px_minmax(0,1fr)_auto] md:items-center">
            <span className="relative grid size-12 place-items-center rounded-xl bg-ink text-glow"><Icon size={20} aria-hidden="true" /><span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-glow font-mono text-[10px] font-medium text-ink">{index + 1}</span></span>
            <div>
              <h2 className="text-[16px] font-medium tracking-[-0.02em]">{title}</h2>
              <p className="mt-1 max-w-2xl text-[13.5px] leading-6 text-muted">{body}</p>
            </div>
            <Link href={href} className="btn-outline btn-sm justify-self-start">{cta} <ArrowRight size={13} className="transition-transform duration-200 group-hover:translate-x-0.5" /></Link>
          </li>
        ))}
      </ol>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="panel overflow-hidden">
          <SectionTitle title="What KindlyPay sees, and what it never sees" helper="Your data stays yours" />
          <div className="grid gap-px bg-line sm:grid-cols-2">
            <div className="bg-surface p-5">
              <p className="eyebrow flex items-center gap-2 text-success"><Check size={13} aria-hidden="true" /> Only this</p>
              <ul className="mt-3 space-y-2 text-[13.5px]">{SEES.map((item) => <li key={item} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />{item}</li>)}</ul>
            </div>
            <div className="bg-surface p-5">
              <p className="eyebrow flex items-center gap-2 text-danger"><EyeOff size={13} aria-hidden="true" /> Never this</p>
              <ul className="mt-3 space-y-2 text-[13.5px]">{NEVER_SEES.map((item) => <li key={item} className="flex gap-2"><X size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />{item}</li>)}</ul>
            </div>
          </div>
          <p className="border-t border-line px-5 py-3.5 text-[12.5px] leading-5 text-muted">Each reminder goes to one customer about their own bill, so no customer ever sees another customer&apos;s amounts. When AI writes a reminder it receives only that one bill&apos;s facts, never your full list.</p>
        </article>

        <article className="overflow-hidden rounded-2xl bg-ink p-6 text-white">
          <p className="eyebrow text-[10.5px] text-white/45">Hard limits</p>
          <h2 className="mt-3 text-[22px] font-medium leading-tight tracking-[-0.03em]">What KindlyPay will never do.<span className="block text-white/45">There is no setting that turns these on.</span></h2>
          <ul className="stagger-in mt-5 grid gap-2 sm:grid-cols-2">
            {NEVER_DOES.map((item) => <li key={item} className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3 text-[13.5px]"><Ban size={15} className="shrink-0 text-[#ff8a7a]" aria-hidden="true" />{item}</li>)}
          </ul>
        </article>
      </section>

      <section className="panel overflow-hidden">
        <SectionTitle title="Words you'll see" helper="Plain words for everything in the app" />
        <dl className="grid gap-px bg-line sm:grid-cols-2">
          {WORDS.map(([word, meaning]) => (
            <div key={word} className="bg-surface px-5 py-4">
              <dt className="text-[14px] font-medium">{word}</dt>
              <dd className="mt-0.5 text-[13px] leading-5 text-muted">{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

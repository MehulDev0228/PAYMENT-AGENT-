"use client";

import Link from "next/link";
import { ArrowRight, Compass, FileUp, Radar, ShieldCheck } from "lucide-react";
import { startTour } from "./shell/product-tour";

const STEPS = [
  { icon: FileUp, title: "Upload your unpaid bills", body: "Four columns: bill number, customer email, amount due, due date. That's all we need.", href: "/imports", cta: "Upload bills" },
  { icon: Radar, title: "Run the daily check", body: "KindlyPay reads every unpaid bill and queues polite reminders by your rules.", href: "/automation", cta: "Open auto reminders" },
  { icon: ShieldCheck, title: "Say yes or no", body: "Late or tricky bills land in “Needs you”. Nothing about money happens without you.", href: "/approvals", cta: "See what needs you" },
];

/** Shown on Today while a new workspace has no bills yet. */
export function GettingStarted() {
  return (
    <section aria-label="Getting started" className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 md:p-6">
      <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-glow/20 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow eyebrow-dot">Your workspace is ready</p>
          <h2 className="mt-2 text-[22px] font-medium tracking-[-0.03em]">Three steps to getting paid on time.</h2>
        </div>
        <button type="button" onClick={startTour} className="btn-outline shrink-0"><Compass size={15} aria-hidden="true" /> Take the 1-minute tour</button>
      </div>
      <ol className="stagger-in relative mt-6 grid gap-3 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body, href, cta }, index) => (
          <li key={title}>
            <Link href={href} className="group flex h-full flex-col rounded-xl border border-line bg-canvas/60 p-4 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-ink hover:bg-surface">
              <div className="flex items-center justify-between">
                <span className="grid size-9 place-items-center rounded-lg bg-ink text-glow"><Icon size={16} aria-hidden="true" /></span>
                <span className="font-mono text-[11px] text-muted">0{index + 1}</span>
              </div>
              <h3 className="mt-4 text-[15px] font-medium tracking-[-0.02em]">{title}</h3>
              <p className="mt-1 flex-1 text-[13px] leading-5 text-muted">{body}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium">{cta} <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" /></span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cx } from "@/components/ui";
import { PLANS } from "./plans";

const rupees = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export function Pricing() {
  const [yearly, setYearly] = useState(true);
  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing period" className="relative inline-flex rounded-full border border-line bg-white p-1 text-[13.5px] font-medium">
          <span aria-hidden="true" className={cx("absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-ink transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", yearly ? "translate-x-full" : "translate-x-0")} />
          <button type="button" role="radio" aria-checked={!yearly} onClick={() => setYearly(false)} className={cx("relative z-10 min-h-9 w-36 rounded-full transition-colors", !yearly ? "text-white" : "text-muted hover:text-ink")}>Monthly</button>
          <button type="button" role="radio" aria-checked={yearly} onClick={() => setYearly(true)} className={cx("relative z-10 min-h-9 w-36 rounded-full transition-colors", yearly ? "text-white" : "text-muted hover:text-ink")}>Yearly <span className={cx("ml-1 rounded-full px-1.5 py-0.5 text-[10.5px]", yearly ? "bg-glow text-ink" : "bg-brand-soft text-success")}>2 months free</span></button>
        </div>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const price = yearly ? plan.yearlyMonthly : plan.monthly;
          const dark = plan.highlight;
          return (
            <article key={plan.key} className={cx("relative flex flex-col rounded-[22px] border p-6 transition-transform duration-300 hover:-translate-y-1", dark ? "border-ink bg-ink text-white shadow-[0_30px_80px_-30px_rgb(10_12_16/0.6)]" : "border-line bg-white")}>
              {dark && <span className="absolute -top-3 left-6 rounded-full bg-glow px-2.5 py-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink">Most picked</span>}
              <p className={cx("eyebrow", dark && "text-white/50")}>{plan.tagline}</p>
              <h3 className="mt-2 text-[22px] font-medium tracking-[-0.03em]">{plan.name}</h3>
              <div className="mt-5 min-h-[64px]">
                {price === null
                  ? <p className="text-[30px] font-medium leading-none tracking-[-0.04em]">Let&apos;s talk</p>
                  : <p className="flex items-baseline gap-1"><span key={`${plan.key}-${yearly}`} className="animate-pop inline-block text-[34px] font-medium leading-none tracking-[-0.04em] tabular">{rupees(price)}</span><span className={cx("text-[13px]", dark ? "text-white/55" : "text-muted")}>/month</span></p>}
                <p className={cx("mt-2 text-[12.5px]", dark ? "text-white/55" : "text-muted")}>{price === null ? "Yearly licence, priced to your setup" : yearly ? `Billed yearly · + GST` : "Billed monthly · + GST"}</p>
              </div>
              <p className={cx("mt-4 border-t pt-4 text-[13.5px] font-medium", dark ? "border-white/10" : "border-line")}>{plan.limit}</p>
              <ul className="mt-3 flex-1 space-y-2.5">
                {plan.features.map((feature) => <li key={feature} className={cx("flex gap-2 text-[13.5px] leading-5", dark ? "text-white/80" : "text-ink/80")}><Check size={15} className={cx("mt-0.5 shrink-0", dark ? "text-glow" : "text-success")} aria-hidden="true" />{feature}</li>)}
              </ul>
              <p className={cx("mt-5 text-[12px]", dark ? "text-white/45" : "text-muted")}>{plan.setup}</p>
              <Link href={price === null ? "/sign-up?plan=enterprise" : `/sign-up?plan=${plan.key}`} className={cx("group mt-3 min-h-11", dark ? "btn-light" : "btn-primary")}>
                {price === null ? "Talk to us" : "Start 30-day free trial"} <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </article>
          );
        })}
      </div>
      <p className="mt-6 text-center text-[13px] text-muted">Every plan: only unpaid bills are uploaded · cancel any time · your data exported or deleted on request.</p>
    </div>
  );
}

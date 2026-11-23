import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo, LogoMark } from "@/components/ui";

const POINTS = [
  "We only see bills that are still unpaid. Never your cash, rates or books.",
  "Every reminder is polite, and built from your bill's facts only.",
  "Discounts, plans and disputes always wait for your yes.",
];

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main id="main" className="flex flex-col px-5 py-6 sm:px-10">
        <div className="[&_a]:text-ink"><Logo tone="dark" href="/" /></div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">{children}</div>
        <p className="text-center text-[12px] text-muted">By continuing you agree to use KindlyPay for lawful collections only. <Link href="/#faq" className="underline-offset-2 hover:underline">Questions?</Link></p>
      </main>

      <aside className="hero-field relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between" aria-label="About KindlyPay">
        <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
        <p className="eyebrow relative text-white/60">Polite collections, on autopilot</p>
        <div className="relative">
          <span className="logo-hover inline-block"><LogoMark className="size-24" /></span>
          <h2 className="display mt-8 max-w-md text-[44px]">Get paid on time, <span className="text-white/55">without the awkward calls.</span></h2>
          <ul className="stagger-in mt-8 max-w-md space-y-3">
            {POINTS.map((point) => <li key={point} className="flex gap-3 text-[15px] leading-6 text-white/80"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-glow" aria-hidden="true" />{point}</li>)}
          </ul>
        </div>
        <p className="relative font-mono text-[11px] text-white/45">© 2026 KindlyPay</p>
      </aside>
    </div>
  );
}

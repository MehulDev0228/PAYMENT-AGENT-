"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Logo, cx } from "@/components/ui";
import { NAV, type NavCounts } from "./nav";

export function NavList({ counts, onNavigate }: { counts: NavCounts; onNavigate?: () => void }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  // One marker that glides to the active page, so moving between pages reads as moving within one place.
  const [marker, setMarker] = useState({ top: 0, visible: false, glide: false });
  const measured = useRef(false);
  useLayoutEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!active) { setMarker((current) => ({ ...current, visible: false })); return; }
    // Placed instantly on first paint; glides on every navigation after that.
    setMarker({ top: active.offsetTop + active.offsetHeight / 2 - 8, visible: true, glide: measured.current });
    measured.current = true;
  }, [pathname]);

  return (
    <nav ref={navRef} aria-label="Workspace" className="relative space-y-6">
      <span aria-hidden="true" className={cx("absolute -left-3 h-4 w-[3px] rounded-r-full bg-glow", marker.glide && "transition-[top,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", marker.visible ? "opacity-100" : "opacity-0")} style={{ top: marker.top }} />
      {NAV.map((group) => (
        <div key={group.label}>
          <p className="eyebrow px-3 pb-2 text-[10px] text-white/40">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon, count }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              const value = count ? counts[count] : 0;
              return (
                <li key={href}>
                  <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} data-tour={`nav-${href.slice(1)}`}
                    className={cx("group relative flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-[13.5px] transition-colors duration-150",
                      active ? "bg-white/[0.09] font-medium text-white" : "text-white/60 hover:bg-white/[0.05] hover:text-white")}>
                    <Icon size={17} strokeWidth={1.8} aria-hidden="true" className={cx("transition-colors", active ? "text-glow" : "text-white/50 group-hover:text-white/80")} />
                    <span className="flex-1">{label}</span>
                    {/* Keyed by value: when a count changes (a decision made, a payment matched) the badge pops. */}
                    {value > 0 && <span key={value} className={cx("animate-pop tabular rounded-md px-1.5 py-0.5 font-mono text-[10.5px]", count === "approvals" || count === "review" ? "bg-[#f5c451]/15 text-[#f5c451]" : "bg-white/10 text-white/70")}>{value}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function GuardrailNote({ businessDate }: { businessDate: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
      <p className="flex items-center gap-2 text-[12.5px] font-medium text-white"><ShieldCheck size={14} className="text-glow" aria-hidden="true" /> Guardrails on</p>
      <p className="mt-1.5 text-[12px] leading-[1.55] text-white/50">Routine reminders run automatically. Money decisions always wait for a person.</p>
      <p className="eyebrow mt-3 border-t border-white/[0.07] pt-3 text-[10.5px] text-white/40">Business date · {businessDate}</p>
    </div>
  );
}

export function Sidebar({ counts, businessDate }: { counts: NavCounts; businessDate: string }) {
  return (
    <aside className="fixed inset-y-3 left-3 z-30 hidden w-[248px] flex-col rounded-2xl bg-ink px-3 pb-3 pt-5 shadow-[0_20px_50px_-24px_rgb(10_12_16/0.6)] lg:flex">
      <div className="px-3"><Logo href="/" /></div>
      {/* Padded out to the aside's edge so the active marker at -left-3 is not clipped by the scroller. */}
      <div className="scrollbar -mx-3 mt-8 flex-1 overflow-y-auto px-3 [scrollbar-color:#2a2f38_transparent]"><NavList counts={counts} /></div>
      <GuardrailNote businessDate={businessDate} />
    </aside>
  );
}

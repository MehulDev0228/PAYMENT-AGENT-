"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Sparkles, X } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { Logo } from "@/components/ui";
import { CommandPalette } from "./command-palette";
import { GuardrailNote, NavList } from "./sidebar";
import type { NavCounts } from "./nav";

export interface Viewer { name: string; role: string; devMode: boolean }

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");

export function Topbar({ counts, businessDate, viewer }: { counts: NavCounts; businessDate: string; viewer: Viewer }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setDrawer(false); }, [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawer(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [drawer]);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center gap-3 px-4 md:px-8">
          <button type="button" onClick={() => setDrawer(true)} className="btn-ghost -ml-2 px-2 lg:hidden" aria-label="Open navigation"><Menu size={20} /></button>
          <div className="lg:hidden [&_a]:text-ink"><Logo tone="dark" href="/dashboard" /></div>
          <div className="hidden flex-1 md:block"><CommandPalette /></div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/ask" className="btn-outline hidden sm:inline-flex"><Sparkles size={15} className="text-brand" aria-hidden="true" /> Ask AERA</Link>
            {viewer.devMode && <span className="whitespace-nowrap rounded-md bg-[#fdf7e6] px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-warning" title="AERA_AUTH_MODE=dev: authentication is off. Never expose this to a network.">Dev mode · no sign-in</span>}
            <div className="ml-1 hidden text-right leading-tight sm:block">
              <p className="text-[13px] font-medium">{viewer.name}</p>
              <p className="text-[11.5px] text-muted">{viewer.role}</p>
            </div>
            <span className="grid size-9 place-items-center rounded-full bg-ink text-[12px] font-medium text-white" aria-hidden="true">{initials(viewer.name)}</span>
            {!viewer.devMode && <form action={signOut}><button type="submit" className="btn-ghost px-2" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></form>}
          </div>
        </div>
      </header>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-ink/50" onClick={() => setDrawer(false)} />
          <div className="animate-rise absolute inset-y-2 left-2 flex w-[min(300px,calc(100vw-16px))] flex-col rounded-2xl bg-ink px-3 pb-3 pt-4">
            <div className="flex items-center justify-between px-3">
              <Logo href="/" />
              <button type="button" onClick={() => setDrawer(false)} className="grid size-10 place-items-center rounded-lg text-white/70 hover:bg-white/10" aria-label="Close navigation"><X size={19} /></button>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto"><NavList counts={counts} onNavigate={() => setDrawer(false)} /></div>
            <GuardrailNote businessDate={businessDate} />
          </div>
        </div>
      )}
    </>
  );
}

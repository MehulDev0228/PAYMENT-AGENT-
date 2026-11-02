"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, Compass, LogOut } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { cx } from "@/components/ui";
import { startTour } from "./product-tour";

export interface ShellUser { name: string; email: string; companyName: string; role: string; demo?: boolean }

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
const ROLE_LABEL: Record<string, string> = { admin: "Owner", finance_manager: "Finance manager", collection_manager: "Collections", viewer: "Viewer" };

export function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative" data-tour="account">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-black/[0.04]">
        <span className="hidden text-right leading-tight sm:block">
          <span className="block text-[13px] font-medium">{user.name}</span>
          <span className="block text-[11.5px] text-muted">{user.companyName}</span>
        </span>
        <span className="grid size-9 place-items-center rounded-full bg-ink text-[12px] font-medium text-white" aria-hidden="true">{initials(user.name)}</span>
        <ChevronDown size={14} className={cx("hidden text-muted transition-transform duration-200 sm:block", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="animate-scale-in absolute right-0 top-[calc(100%+8px)] z-40 w-64 origin-top-right overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_60px_-20px_rgb(10_12_16/0.35)]">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-[13.5px] font-medium">{user.name}</p>
            <p className="truncate text-[12px] text-muted">{user.email}</p>
            <p className="eyebrow mt-2 text-[10px]">{ROLE_LABEL[user.role] ?? user.role} · {user.companyName}</p>
          </div>
          <div className="p-1.5">
            <button type="button" role="menuitem" onClick={() => { setOpen(false); startTour(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-canvas"><Compass size={15} className="text-muted" aria-hidden="true" /> Take the tour</button>
            <Link href="/guide" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] hover:bg-canvas"><BookOpen size={15} className="text-muted" aria-hidden="true" /> How KindlyPay works</Link>
          </div>
          <form action={signOutAction} className="border-t border-line p-1.5">
            <button type="submit" role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] text-danger hover:bg-[#fdecea]"><LogOut size={15} aria-hidden="true" /> Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}

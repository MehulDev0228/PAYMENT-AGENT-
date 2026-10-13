"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, CornerDownLeft, FileText, Search } from "lucide-react";
import type { SearchResult } from "@/lib/domain/types";
import { cx } from "@/components/ui";
import { NAV } from "./nav";

type Entry = { id: string; title: string; subtitle: string; href: string; kind: "page" | SearchResult["kind"] };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const router = useRouter();

  const close = useCallback(() => { setOpen(false); setQuery(""); setRemote([]); returnFocus.current?.focus(); }, []);
  const show = useCallback(() => { returnFocus.current = document.activeElement as HTMLElement; setOpen(true); }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); if (open) close(); else show(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, show]);

  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) { setRemote([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : []))
        .then(setRemote)
        .catch(() => undefined);
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  const entries = useMemo<Entry[]>(() => {
    const needle = query.trim().toLowerCase();
    const pages = NAV.flatMap((group) => group.items)
      .filter((item) => !needle || item.label.toLowerCase().includes(needle))
      .map((item) => ({ id: item.href, title: item.label, subtitle: "Go to page", href: item.href, kind: "page" as const }));
    return [...remote.map((item) => ({ ...item, id: `${item.kind}-${item.id}` })), ...pages];
  }, [query, remote]);

  useEffect(() => { setActive(0); }, [entries.length]);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    close();
    router.push(entry.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(entries.length - 1, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    else if (event.key === "Enter") { event.preventDefault(); go(entries[active]); }
  }

  return (
    <>
      <button type="button" onClick={show} className="group flex min-h-10 w-full max-w-[420px] items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 text-left text-sm text-muted transition-colors hover:border-line-strong">
        <Search size={15} aria-hidden="true" />
        <span className="flex-1 truncate">Search invoices, customers, pages…</span>
        <kbd className="hidden rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10.5px] text-muted sm:inline">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div role="dialog" aria-modal="true" aria-label="Command palette" className="animate-rise w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_80px_-20px_rgb(10_12_16/0.45)]" onKeyDown={onKeyDown}>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={17} className="text-muted" aria-hidden="true" />
              <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try INV-1042 or a customer name"
                className="min-h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#8a909c]" role="combobox" aria-expanded="true" aria-controls="palette-results" aria-activedescendant={entries[active] ? `palette-${entries[active].id}` : undefined} />
              <kbd className="rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10.5px] text-muted">Esc</kbd>
            </div>
            <ul id="palette-results" role="listbox" className="scrollbar max-h-[360px] overflow-y-auto p-2">
              {entries.map((entry, index) => {
                const Icon = entry.kind === "customer" ? Building2 : entry.kind === "page" ? ArrowRight : FileText;
                return (
                  <li key={entry.id} id={`palette-${entry.id}`} role="option" aria-selected={index === active}
                    onMouseEnter={() => setActive(index)} onClick={() => go(entry)}
                    className={cx("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5", index === active && "bg-canvas")}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted"><Icon size={15} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{entry.title}</span>
                      <span className="block truncate text-[12.5px] text-muted">{entry.subtitle}</span>
                    </span>
                    {index === active && <CornerDownLeft size={14} className="text-muted" aria-hidden="true" />}
                  </li>
                );
              })}
              {entries.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">No matches for “{query}”.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

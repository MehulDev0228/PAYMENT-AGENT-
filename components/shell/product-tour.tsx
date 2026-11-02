"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { LogoMark, cx } from "@/components/ui";

const TOUR_EVENT = "kindlypay:tour";
const HOME = "/dashboard";

/** Starts the product tour from anywhere in the workspace (it opens on the home page). */
export function startTour() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}

interface Step {
  /** A [data-tour] name. Without one, or when it is not on screen (e.g. the sidebar on a phone), the card sits centred. */
  target?: string;
  title: string;
  body: ReactNode;
  /** Shown instead of the spotlight when the target is hidden on this screen size. */
  hiddenHint?: string;
}

const STEPS: Step[] = [
  { title: "Welcome", body: null },
  { target: "agenda", title: "Today, at a glance", body: "The four numbers worth your morning: decisions waiting for you, pay dates coming up, payments to match and missed pay dates. Click any of them to jump straight there." },
  { target: "nav-cases", title: "Unpaid bills", body: "Every bill that is still owed, sorted by who to chase first. Polite reminders go out on their own, so you don't have to write a single follow-up.", hiddenHint: "Find it in the menu (☰), top left." },
  { target: "nav-approvals", title: "Needs you", body: "Anything that touches money, like a discount, a payment plan or a dispute, waits here for your yes. KindlyPay never decides these on its own.", hiddenHint: "Find it in the menu (☰), top left." },
  { target: "nav-promises", title: "Pay dates", body: "When a customer replies “we'll pay on Tuesday”, that date is saved here and checked against your bank. No money in, no tick.", hiddenHint: "Find it in the menu (☰), top left." },
  { target: "nav-payments", title: "Money in", body: "Upload your bank statement and payments are matched to bills automatically. If a payment could fit two bills, it waits for you instead of guessing.", hiddenHint: "Find it in the menu (☰), top left." },
  { target: "nav-imports", title: "Upload: start here", body: "Bring in your unpaid bills with just four columns: bill number, customer email, amount due and due date. Never your cash sales, rates or books.", hiddenHint: "Find it in the menu (☰), top left." },
  { target: "nav-automation", title: "Auto reminders", body: "A daily check reviews every unpaid bill against your rules. Run it by hand whenever you like and see exactly what it did, and why.", hiddenHint: "Find it in the menu (☰), top left." },
  { target: "search", title: "Find anything", body: <>Press <kbd className="rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px]">Ctrl K</kbd> to jump to any bill, customer or page in a second.</> },
  { target: "ask", title: "Ask KindlyPay", body: "Ask in plain words, like “how much is overdue?” Every answer shows the record it came from. No guessed numbers.", hiddenHint: "Open it from the menu (☰): Ask KindlyPay." },
  { target: "account", title: "You're all set", body: null },
];

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;
const GAP = 16;
const CARD_WIDTH = 344;

function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  return candidates.find((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }) ?? null;
}

function measure(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();
  return { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
}

/** Places the card beside the spotlight: right, then below, then above, then left; centred when nothing fits. */
function placeCard(rect: Rect | null, card: { width: number; height: number }) {
  const vw = window.innerWidth; const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(16, x), vw - card.width - 16);
  const clampY = (y: number) => Math.min(Math.max(16, y), vh - card.height - 16);
  if (!rect) return { top: clampY((vh - card.height) / 2), left: clampX((vw - card.width) / 2) };
  if (rect.left + rect.width + GAP + card.width <= vw - 16) return { top: clampY(rect.top + rect.height / 2 - card.height / 2), left: rect.left + rect.width + GAP };
  if (rect.top + rect.height + GAP + card.height <= vh - 16) return { top: rect.top + rect.height + GAP, left: clampX(rect.left + rect.width / 2 - card.width / 2) };
  if (rect.top - GAP - card.height >= 16) return { top: rect.top - GAP - card.height, left: clampX(rect.left + rect.width / 2 - card.width / 2) };
  if (rect.left - GAP - card.width >= 16) return { top: clampY(rect.top + rect.height / 2 - card.height / 2), left: rect.left - GAP - card.width };
  // A target taller than the room around it: tuck the card into its lower-right corner.
  return { top: clampY(rect.top + rect.height - card.height - GAP), left: clampX(rect.left + rect.width - card.width - GAP) };
}

export function ProductTour({ tourKey, firstName }: { tourKey: string; firstName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const storageKey = `kp-tour-done:${tourKey}`;

  const finish = useCallback(() => {
    setIndex(null); setRect(null); setCardPos(null);
    try { localStorage.setItem(storageKey, "1"); } catch { /* storage may be unavailable; the tour simply shows again */ }
  }, [storageKey]);

  // Start on request (menu, guide page) or on someone's very first visit to the home page.
  useEffect(() => {
    const onStart = () => { if (pathname === HOME) setIndex(0); else router.push(`${HOME}?tour=1`); };
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, [pathname, router]);

  useEffect(() => {
    if (pathname !== HOME) return;
    let seen = false;
    try { seen = localStorage.getItem(storageKey) === "1"; } catch { seen = true; }
    const requested = params.get("tour") === "1";
    if (requested) router.replace(HOME, { scroll: false });
    if (!requested && seen) return;
    const timer = setTimeout(() => setIndex(0), requested ? 300 : 900); // let the page settle in first
    return () => clearTimeout(timer);
  }, [pathname, params, router, storageKey]);

  const step = index === null ? null : STEPS[index];

  // Follow the target: bring it into view, then track it through scrolling and resizing.
  useEffect(() => {
    if (!step) return;
    const element = findTarget(step.target);
    if (!element) { setRect(null); return; }
    // Page content is brought up near the top so the card has room beneath it; the fixed sidebar and top bar never need scrolling.
    const inView = element.getBoundingClientRect();
    const fixed = Boolean(element.closest("aside, header"));
    if (!fixed && (inView.top < 80 || inView.top > window.innerHeight * 0.35)) window.scrollTo({ top: window.scrollY + inView.top - 96, behavior: "smooth" });
    const update = () => setRect(measure(element));
    update();
    // Re-measure as a smooth scroll lands.
    const settle = [250, 600, 1000].map((delay) => setTimeout(update, delay));
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    return () => { settle.forEach(clearTimeout); window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [step]);

  useLayoutEffect(() => {
    if (!step || !cardRef.current) return;
    setCardPos(placeCard(rect, { width: cardRef.current.offsetWidth, height: cardRef.current.offsetHeight }));
  }, [step, rect, index]);

  useEffect(() => { if (index !== null) cardRef.current?.focus({ preventScroll: true }); }, [index]);

  if (index === null || !step) return null;
  const last = index === STEPS.length - 1;
  const next = () => (last ? finish() : setIndex(index + 1));
  const back = () => setIndex(Math.max(0, index - 1));
  const welcome = index === 0;
  const targetMissing = Boolean(step.target) && !rect;

  return createPortal(
    <div className="fixed inset-0 z-[90]" onKeyDown={(event) => {
      if (event.key === "Escape") finish();
      else if (event.key === "ArrowRight" || event.key === "Enter") { event.preventDefault(); next(); }
      else if (event.key === "ArrowLeft") back();
    }}>
      {/* The dim layer. With a target it is the spotlight's own shadow, so the highlighted area stays clear. */}
      {rect
        ? <div aria-hidden="true" className="pointer-events-none fixed rounded-[14px] transition-[top,left,width,height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] [box-shadow:0_0_0_2px_rgb(63_226_157/0.95),0_0_0_7px_rgb(63_226_157/0.18),0_0_0_9999px_rgb(10_12_16/0.62)]" style={rect} />
        : <div aria-hidden="true" className="animate-fade-in fixed inset-0 bg-ink/60 backdrop-blur-[2px]" />}
      <div className="fixed inset-0" aria-hidden="true" />

      <div ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="tour-title" tabIndex={-1}
        className={cx("fixed rounded-2xl bg-surface text-ink shadow-[0_30px_80px_-20px_rgb(10_12_16/0.55)] outline-none transition-[top,left,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]", cardPos ? "opacity-100" : "opacity-0")}
        style={{ width: `min(${welcome ? 420 : CARD_WIDTH}px, calc(100vw - 32px))`, top: cardPos?.top ?? 0, left: cardPos?.left ?? 0 }}>
        <div key={index} className="animate-rise p-5">
          {welcome ? (
            <div className="text-center">
              <span className="logo-hover inline-block text-ink"><LogoMark className="size-16" /></span>
              <h2 id="tour-title" className="mt-4 text-[22px] font-medium tracking-[-0.03em]">Welcome to KindlyPay, {firstName}.</h2>
              <p className="mt-2 text-[14px] leading-6 text-muted">One minute, ten stops: where your money is, what needs you, and how polite reminders go out on their own.</p>
              <div className="mt-5 flex flex-col gap-2">
                <button type="button" onClick={next} className="btn-primary min-h-11">Show me around <ArrowRight size={15} /></button>
                <button type="button" onClick={finish} className="btn-ghost">I&apos;ll explore on my own</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="eyebrow text-[10.5px]">Step {index} of {STEPS.length - 1}</p>
                <button type="button" onClick={finish} aria-label="Close the tour" className="-mr-1.5 grid size-8 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"><X size={16} /></button>
              </div>
              <h2 id="tour-title" className="mt-2 text-[17px] font-medium tracking-[-0.025em]">{step.title}</h2>
              {last
                ? <p className="mt-1.5 text-[13.5px] leading-6 text-muted">Retake this tour or read the full guide from your name, top right, any time. The best first step is uploading the bills that are still unpaid.</p>
                : <p className="mt-1.5 text-[13.5px] leading-6 text-muted">{step.body}</p>}
              {targetMissing && step.hiddenHint && <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-[12.5px] text-muted">{step.hiddenHint}</p>}
              <div className="mt-4 flex gap-1" aria-hidden="true">
                {STEPS.slice(1).map((_, dot) => <span key={dot} className={cx("h-1 flex-1 rounded-full transition-colors duration-300", dot < index ? "bg-ink" : "bg-line")} />)}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <button type="button" onClick={back} className="btn-ghost btn-sm -ml-2"><ArrowLeft size={14} /> Back</button>
                {last ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={finish} className="btn-outline btn-sm">Done</button>
                    <Link href="/imports" onClick={finish} className="btn-primary btn-sm"><Check size={14} /> Upload my bills</Link>
                  </div>
                ) : <button type="button" onClick={next} className="btn-primary btn-sm">Next <ArrowRight size={14} /></button>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

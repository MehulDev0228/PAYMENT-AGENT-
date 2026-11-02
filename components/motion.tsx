"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/*
 * Elements waiting to be revealed. An element counts as seen once its top is above the lower edge of
 * the viewport, so content the reader jumped past (an anchor link, a fast fling) is shown too, which
 * an IntersectionObserver would miss.
 */
const waiting = new Map<Element, () => void>();

function revealSeen() {
  const fold = window.innerHeight * 0.92;
  for (const [element, onVisible] of waiting) {
    if (element.getBoundingClientRect().top < fold) { waiting.delete(element); onVisible(); }
  }
  if (waiting.size === 0) {
    window.removeEventListener("scroll", revealSeen);
    window.removeEventListener("resize", revealSeen);
  }
}

/** Calls `onVisible` once, the first time `element` has been scrolled into view. */
function useOnVisible<T extends Element>(onVisible: (element: T) => void) {
  const ref = useRef<T>(null);
  const callback = useRef(onVisible);
  callback.current = onVisible;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (waiting.size === 0) {
      window.addEventListener("scroll", revealSeen, { passive: true });
      window.addEventListener("resize", revealSeen, { passive: true });
    }
    waiting.set(element, () => callback.current(element));
    revealSeen();
    return () => { waiting.delete(element); };
  }, []);
  return ref;
}

type RevealTag = "div" | "section" | "article" | "ol" | "ul" | "dl" | "header";

/**
 * Fades its content up the first time it scrolls into view. With `stagger`, its direct
 * children arrive one after another instead, in reading order.
 */
export function Reveal({ as: Tag = "div", stagger = false, className, style, children, id }: { as?: RevealTag; stagger?: boolean; className?: string; style?: CSSProperties; children: ReactNode; id?: string }) {
  const ref = useOnVisible<HTMLElement>((element) => element.setAttribute("data-shown", ""));
  const Component = Tag as "div";
  return <Component ref={ref as React.Ref<HTMLDivElement>} id={id} data-reveal="" data-stagger={stagger ? "" : undefined} className={className} style={style}>{children}</Component>;
}

const NUMBER = /\d[\d,]*(\.\d+)?/;

/**
 * Counts the first number inside a formatted value ("₹25.9Cr", "4,69,662", "18") up from zero
 * when it comes into view, keeping its prefix, suffix, decimals and digit grouping.
 */
export function CountUp({ value, duration = 1100 }: { value: string; duration?: number }) {
  const match = value.match(NUMBER);
  const [display, setDisplay] = useState(value);
  const ref = useOnVisible<HTMLSpanElement>((element) => {
    element.setAttribute("data-ready", "");
    if (!match || prefersReducedMotion() || document.hidden) return;
    const target = Number(match[0].replaceAll(",", ""));
    const decimals = match[1] ? match[1].length - 1 : 0;
    const grouped = match[0].includes(",");
    const prefix = value.slice(0, match.index);
    const suffix = value.slice((match.index ?? 0) + match[0].length);
    const format = (n: number) => grouped ? n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : n.toFixed(decimals);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(t < 1 ? `${prefix}${format(target * eased)}${suffix}` : value);
      if (t < 1) requestAnimationFrame(tick);
    };
    setDisplay(`${prefix}${format(0)}${suffix}`);
    requestAnimationFrame(tick);
  });

  // A new value after a refresh is shown as-is; only the first appearance counts up.
  useEffect(() => { setDisplay(value); }, [value]);

  return (
    <span className="tabular">
      <span className="sr-only">{value}</span>
      <span ref={ref} aria-hidden="true" data-countup="">{display}</span>
    </span>
  );
}

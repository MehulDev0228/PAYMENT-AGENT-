import Link from "next/link";
import { MapPin } from "lucide-react";
import { cx } from "@/components/ui";
import { regionKey } from "@/lib/domain/regions";

/** Region pills for list pages. `hrefFor(undefined)` is the all-regions link. Hidden when there is nothing to choose. */
export function RegionFilter({ regions, active, hrefFor }: { regions: string[]; active?: string; hrefFor: (region?: string) => string }) {
  if (regions.length < 2 && !active) return null;
  const items = [{ key: "", label: "All regions" }, ...regions.map((region) => ({ key: region, label: region }))];
  if (active && !regions.some((region) => regionKey(region) === regionKey(active))) items.push({ key: active, label: active });
  return (
    <nav aria-label="Filter by region" className="scrollbar mt-4 flex items-center gap-1.5 overflow-x-auto">
      <MapPin size={14} className="mr-0.5 shrink-0 text-muted" aria-hidden="true" />
      {items.map((item) => {
        const isActive = regionKey(item.key) === regionKey(active);
        return (
          <Link key={item.key || "all"} href={hrefFor(item.key || undefined)} aria-current={isActive ? "page" : undefined}
            className={cx("inline-flex min-h-8 shrink-0 items-center rounded-full border px-3 text-[12.5px] transition-colors", isActive ? "border-ink bg-ink font-medium text-white" : "border-line bg-white text-muted hover:border-ink/30 hover:text-ink")}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The ?region= value of a page, trimmed; undefined when absent. */
export function regionParam(value: string | string[] | undefined): string | undefined {
  const region = (Array.isArray(value) ? value[0] : value)?.trim();
  return region || undefined;
}

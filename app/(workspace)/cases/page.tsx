import type { Metadata } from "next";
import { Search } from "lucide-react";
import { CasesTable } from "@/components/cases-table";
import { PageHeader, Pagination, Tabs } from "@/components/ui";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { CASE_VIEWS, isCaseView, type CaseView } from "@/lib/domain/case-views";
import type { CollectionCase } from "@/lib/domain/types";

export const metadata: Metadata = { title: "Cases" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const PRIORITIES: Array<CollectionCase["priority"]> = ["critical", "high", "medium", "low"];

type Search = { view?: string; q?: string; priority?: string; page?: string };

export default async function CasesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { companyId } = getRequestContext();
  const view: CaseView = isCaseView(params.view) ? params.view : "open";
  const q = params.q?.trim() || undefined;
  const priority = PRIORITIES.find((item) => item === params.priority);

  const href = (next: Partial<Search>) => {
    const merged = { view, q, priority, ...next };
    const isDefault = ([key, value]: [string, string | undefined]) => !value || (key === "view" && value === "open") || (key === "page" && value === "1");
    const query = new URLSearchParams(Object.entries(merged).filter((entry) => !isDefault(entry)) as Array<[string, string]>);
    return `/cases${query.size ? `?${query}` : ""}`;
  };

  const matching = await repository.listCases(companyId, { q, priority });
  const inView = (key: CaseView) => matching.filter((item) => CASE_VIEWS[key].statuses.includes(item.status));
  const counts = Object.fromEntries((Object.keys(CASE_VIEWS) as CaseView[]).map((key) => [key, inView(key).length]));
  const all = inView(view);
  const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number(params.page) || 1));
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operational queue" title="Collection cases." muted="Every invoice that needs attention, with its next step." />
      <div className="panel overflow-hidden">
        <div className="border-b border-line px-3 pt-1">
          <Tabs active={view} items={(Object.keys(CASE_VIEWS) as CaseView[]).map((key) => ({ key, label: CASE_VIEWS[key].label, href: href({ view: key, page: undefined }), count: counts[key] }))} />
        </div>
        <form action="/cases" className="flex flex-wrap gap-2 border-b border-line px-5 py-3" role="search">
            {view !== "open" && <input type="hidden" name="view" value={view} />}
            <label className="relative">
              <span className="sr-only">Search cases</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input name="q" defaultValue={q} placeholder="Customer, invoice or code" className="input w-[min(260px,70vw)] pl-9" />
            </label>
            <label>
              <span className="sr-only">Priority</span>
              <select name="priority" defaultValue={priority ?? ""} className="input w-auto pr-8">
                <option value="">Any priority</option>
                {PRIORITIES.map((item) => <option key={item} value={item} className="capitalize">{item}</option>)}
              </select>
            </label>
            <button className="btn-primary" type="submit">Apply</button>
            {(q || priority) && <a href={href({ q: undefined, priority: undefined, page: undefined })} className="btn-ghost">Clear</a>}
        </form>
        <CasesTable cases={rows} />
        <Pagination page={page} pageCount={pageCount} total={all.length} label="cases" hrefFor={(next) => href({ page: String(next) })} />
      </div>
    </div>
  );
}

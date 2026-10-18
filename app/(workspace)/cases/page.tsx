import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { CasesTable } from "@/components/cases-table";
import { ExportLinks } from "@/components/export-links";
import { RegionFilter, regionParam } from "@/components/region-filter";
import { PageHeader, Pagination, Tabs, cx } from "@/components/ui";
import { getPageContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { withRegion } from "@/lib/data/repository";
import { CASE_VIEWS, isCaseView, type CaseView } from "@/lib/domain/case-views";
import { resolveAssigneeFilter } from "@/lib/domain/collector";
import type { CollectionCase } from "@/lib/domain/types";

export const metadata: Metadata = { title: "Cases" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const PRIORITIES: Array<CollectionCase["priority"]> = ["critical", "high", "medium", "low"];

type Search = { view?: string; q?: string; priority?: string; region?: string; assignee?: string; page?: string };

export default async function CasesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const context = await getPageContext();
  const { userId } = context;
  const view: CaseView = isCaseView(params.view) ? params.view : "open";
  const q = params.q?.trim() || undefined;
  const priority = PRIORITIES.find((item) => item === params.priority);
  const region = regionParam(params.region);
  const users = await repository.listUsers(context);
  // "me" and "none" are kept as-is in links; a user id must belong to this workspace.
  const assignee = params.assignee === "me" || params.assignee === "none" || users.some((user) => user.id === params.assignee) ? params.assignee : undefined;
  const assignedTo = resolveAssigneeFilter(assignee, userId);

  const href = (next: Partial<Search>) => {
    const merged = { view, q, priority, region, assignee, ...next };
    const isDefault = ([key, value]: [string, string | undefined]) => !value || (key === "view" && value === "open") || (key === "page" && value === "1");
    const query = new URLSearchParams(Object.entries(merged).filter((entry) => !isDefault(entry)) as Array<[string, string]>);
    return `/cases${query.size ? `?${query}` : ""}`;
  };

  const scope = withRegion(context, region);
  const matching = await repository.listCases(scope, { q, priority, assignedTo });
  const regions = await repository.regions(context);
  const inView = (key: CaseView) => matching.filter((item) => CASE_VIEWS[key].statuses.includes(item.status));
  const counts = Object.fromEntries((Object.keys(CASE_VIEWS) as CaseView[]).map((key) => [key, inView(key).length]));
  const all = inView(view);
  const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number(params.page) || 1));
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const mine = assignee === "me";
  const myOpenCount = (await repository.listCases(scope, { statuses: CASE_VIEWS.open.statuses, assignedTo: userId })).length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operational queue" title={mine ? "My cases." : "Collection cases."} muted={mine ? "The invoices you own, with their next step." : "Every invoice that needs attention, with its next step."}
        actions={<ExportLinks report="cases" query={{ view: view === "open" ? undefined : view, q, priority, region, assignee }} />}>
        <RegionFilter regions={regions} active={region} hrefFor={(next) => href({ region: next, page: undefined })} />
      </PageHeader>
      <nav aria-label="Case owner" className="inline-flex rounded-xl border border-line bg-white p-1">
        {[{ label: "All cases", value: undefined, count: undefined }, { label: "My cases", value: "me", count: myOpenCount }].map((option) => {
          const active = (option.value === "me") === mine;
          return (
            <Link key={option.label} href={href({ assignee: option.value, page: undefined })} aria-current={active ? "page" : undefined}
              className={cx("inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-[13px] transition-colors", active ? "bg-ink font-medium text-white" : "text-muted hover:text-ink")}>
              {option.label}
              {option.count !== undefined && <span className={cx("tabular rounded-md px-1.5 py-0.5 font-mono text-[10.5px]", active ? "bg-white/15" : "bg-black/[0.05]")}>{option.count}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="panel overflow-hidden">
        <div className="border-b border-line px-3 pt-1">
          <Tabs active={view} items={(Object.keys(CASE_VIEWS) as CaseView[]).map((key) => ({ key, label: CASE_VIEWS[key].label, href: href({ view: key, page: undefined }), count: counts[key] }))} />
        </div>
        <form action="/cases" className="flex flex-wrap gap-2 border-b border-line px-5 py-3" role="search">
            {view !== "open" && <input type="hidden" name="view" value={view} />}
            {region && <input type="hidden" name="region" value={region} />}
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
            <label>
              <span className="sr-only">Assigned to</span>
              <select name="assignee" defaultValue={assignee ?? ""} className="input w-auto pr-8">
                <option value="">Anyone</option>
                <option value="me">Me</option>
                <option value="none">Unassigned</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>
            <button className="btn-primary" type="submit">Apply</button>
            {(q || priority || assignee) && <a href={href({ q: undefined, priority: undefined, assignee: undefined, page: undefined })} className="btn-ghost">Clear</a>}
        </form>
        <CasesTable cases={rows} />
        <Pagination page={page} pageCount={pageCount} total={all.length} label="cases" hrefFor={(next) => href({ page: String(next) })} />
      </div>
    </div>
  );
}

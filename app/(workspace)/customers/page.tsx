import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Building2, Search } from "lucide-react";
import { EmptyState, PageHeader, Pagination } from "@/components/ui";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { formatMoney } from "@/lib/domain/money";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const { companyId } = getRequestContext();
  const q = params.q?.trim() || undefined;
  const all = await repository.listCustomers(companyId, q);
  const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number(params.page) || 1));
  const href = (next: number) => { const query = new URLSearchParams(); if (q) query.set("q", q); if (next > 1) query.set("page", String(next)); return `/customers${query.size ? `?${query}` : ""}`; };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Accounts" title="Who owes what." muted="Ranked by overdue exposure." />
      <div className="panel overflow-hidden">
        <form action="/customers" role="search" className="flex flex-wrap gap-2 border-b border-line p-4">
          <label className="relative flex-1 sm:max-w-sm">
            <span className="sr-only">Search customers</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input name="q" defaultValue={q} placeholder="Name, code or email" className="input pl-9" />
          </label>
          <button type="submit" className="btn-primary">Search</button>
          {q && <Link href="/customers" className="btn-ghost">Clear</Link>}
        </form>
        {all.length === 0 ? <EmptyState icon={Building2} title="No customers match" /> : (
          <div className="scrollbar overflow-x-auto">
            <table className="table-base min-w-[860px]">
              <thead><tr><th scope="col">Customer</th><th scope="col">Region · manager</th><th scope="col" className="text-right">Outstanding</th><th scope="col" className="text-right">Overdue</th><th scope="col" className="text-right">Oldest</th><th scope="col" className="text-right">Open cases</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((customer) => (
                  <tr key={customer.id} className="group">
                    <td><Link href={`/customers/${customer.id}`} className="block font-medium">{customer.name}</Link><span className="font-mono text-[11.5px] text-muted">{customer.customerCode}</span></td>
                    <td className="text-[13px] text-muted">{customer.region} · {customer.accountManager}</td>
                    <td className="tabular text-right">{formatMoney(customer.outstanding)}</td>
                    <td className="tabular text-right font-medium">{customer.overdue ? <span className="text-danger">{formatMoney(customer.overdue)}</span> : <span className="text-muted">—</span>}</td>
                    <td className="tabular text-right text-muted">{customer.maxDaysOverdue ? `${customer.maxDaysOverdue}d` : "—"}</td>
                    <td className="tabular text-right">{customer.openCases}</td>
                    <td className="w-12 text-right"><Link href={`/customers/${customer.id}`} aria-label={`Open ${customer.name}`} className="inline-grid size-9 place-items-center rounded-lg text-muted transition-colors group-hover:bg-ink group-hover:text-white"><ArrowUpRight size={16} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageCount={pageCount} total={all.length} label="customers" hrefFor={href} />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { EmptyState, PageHeader, Pagination, RowLink } from "@/components/ui";
import { getSessionContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { formatMoney } from "@/lib/domain/money";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const { companyId } = await getSessionContext();
  const q = params.q?.trim() || undefined;
  const all = await repository.listCustomers(companyId, q);
  const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number(params.page) || 1));
  const href = (next: number) => { const query = new URLSearchParams(); if (q) query.set("q", q); if (next > 1) query.set("page", String(next)); return `/customers${query.size ? `?${query}` : ""}`; };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Customers" title="Who owes what." muted="Most overdue first." />
      <div className="panel overflow-hidden">
        <form action="/customers" role="search" className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
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
              <thead><tr><th scope="col">Customer</th><th scope="col">Region · handled by</th><th scope="col" className="text-right">Unpaid</th><th scope="col" className="text-right">Late</th><th scope="col" className="text-right">Oldest</th><th scope="col" className="text-right">Unpaid bills</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((customer) => (
                  <tr key={customer.id} className="group">
                    <td><Link href={`/customers/${customer.id}`} className="block font-medium">{customer.name}</Link><span className="font-mono text-[11.5px] text-muted">{customer.customerCode}</span></td>
                    <td className="text-[13px] text-muted">{customer.region} · {customer.accountManager}</td>
                    <td className="tabular text-right">{formatMoney(customer.outstanding)}</td>
                    <td className="tabular text-right font-medium">{customer.overdue ? <span className="text-danger">{formatMoney(customer.overdue)}</span> : <span className="text-muted">—</span>}</td>
                    <td className="tabular text-right text-muted">{customer.maxDaysOverdue ? `${customer.maxDaysOverdue}d` : "—"}</td>
                    <td className="tabular text-right">{customer.openCases}</td>
                    <td className="w-12 text-right"><RowLink href={`/customers/${customer.id}`} label={`Open ${customer.name}`} /></td>
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

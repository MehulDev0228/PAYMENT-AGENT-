import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { CasesTable } from "@/components/cases-table";
import { SectionTitle, StatTile, StatusBadge, formatDate } from "@/components/ui";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { formatMoney } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: repository.getCustomer(getRequestContext().companyId, id)?.name ?? "Customer" };
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = repository.getCustomerDetail(getRequestContext().companyId, id);
  if (!customer) notFound();
  const kept = customer.promises.filter((item) => item.status === "fulfilled").length;
  const broken = customer.promises.filter((item) => item.status === "missed").length;

  return (
    <div className="space-y-6">
      <Link href="/customers" className="btn-ghost -ml-3"><ArrowLeft size={16} /> All customers</Link>
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2"><p className="eyebrow eyebrow-dot">Customer · {customer.customerCode}</p><StatusBadge value={customer.status === "active" ? "active" : customer.status} /></div>
          <h1 className="title mt-3">{customer.name}</h1>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
            <li className="flex items-center gap-1.5"><Mail size={14} aria-hidden="true" />{customer.email}</li>
            {customer.phone && <li className="flex items-center gap-1.5"><Phone size={14} aria-hidden="true" />{customer.phone}</li>}
            {customer.region && <li className="flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" />{customer.region}</li>}
            {customer.accountManager && <li className="flex items-center gap-1.5"><UserRound size={14} aria-hidden="true" />{customer.accountManager}</li>}
          </ul>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Outstanding" value={formatMoney(customer.outstanding, "INR", true)} helper={`${customer.openInvoices} open invoices`} />
        <StatTile label="Overdue" value={formatMoney(customer.overdue, "INR", true)} helper={customer.maxDaysOverdue ? `Oldest ${customer.maxDaysOverdue} days` : "Nothing overdue"} accent="danger" />
        <StatTile label="Open cases" value={String(customer.openCases)} helper={`${customer.cases.length} cases all time`} />
        <StatTile label="Promise record" value={`${kept} / ${kept + broken}`} helper={kept + broken ? "Kept vs. due promises" : "No promises yet"} accent="success" />
      </section>

      <article className="panel overflow-hidden">
        <SectionTitle title="Collection cases" helper="Open first, then by priority" />
        <CasesTable cases={customer.cases} />
      </article>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="panel overflow-hidden">
          <SectionTitle title="Invoices" helper={`${customer.invoices.length} on record`} />
          <div className="scrollbar max-h-[420px] overflow-auto">
            <table className="table-base">
              <thead><tr><th scope="col">Invoice</th><th scope="col">Due</th><th scope="col" className="text-right">Outstanding</th><th scope="col">Status</th></tr></thead>
              <tbody>{customer.invoices.map((invoice) => <tr key={invoice.id}><td className="font-mono text-[12px]">{invoice.invoiceNumber}</td><td className="tabular text-muted">{formatDate(invoice.dueDate)}</td><td className="tabular text-right">{formatMoney(invoice.amountOutstanding, invoice.currency)}</td><td><StatusBadge value={invoice.status} /></td></tr>)}</tbody>
            </table>
          </div>
        </article>
        <article className="panel overflow-hidden">
          <SectionTitle title="Payments" helper={`${customer.payments.length} matched to this customer`} />
          <div className="scrollbar max-h-[420px] overflow-auto">
            {customer.payments.length === 0 ? <p className="px-5 py-10 text-center text-[13px] text-muted">No payments recorded.</p> : (
              <table className="table-base">
                <thead><tr><th scope="col">Reference</th><th scope="col">Date</th><th scope="col" className="text-right">Amount</th></tr></thead>
                <tbody>{customer.payments.map((payment) => <tr key={payment.id}><td className="font-mono text-[12px]">{payment.paymentReference}</td><td className="tabular text-muted">{formatDate(payment.paymentDate)}</td><td className="tabular text-right">{formatMoney(payment.amount)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

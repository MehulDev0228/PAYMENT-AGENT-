import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, HandCoins, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { CasesTable } from "@/components/cases-table";
import { EmptyState, SectionTitle, StatTile, StatusBadge, formatDate } from "@/components/ui";
import { getSessionContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { formatMoney } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: (await repository.getCustomer((await getSessionContext()).companyId, id))?.name ?? "Customer" };
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await repository.getCustomerDetail((await getSessionContext()).companyId, id);
  if (!customer) notFound();
  const kept = customer.promises.filter((item) => item.status === "fulfilled").length;
  const broken = customer.promises.filter((item) => item.status === "missed").length;

  return (
    <div className="space-y-6">
      <Link href="/customers" className="btn-ghost -ml-3"><ArrowLeft size={16} /> All customers</Link>
      <header>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><p className="eyebrow eyebrow-dot">Customer · {customer.customerCode}</p><StatusBadge value={customer.status === "active" ? "active" : customer.status} /></div>
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
        <StatTile label="Unpaid" value={formatMoney(customer.outstanding, "INR", true)} helper={`${customer.openInvoices} unpaid bills`} />
        <StatTile label="Late" value={formatMoney(customer.overdue, "INR", true)} helper={customer.maxDaysOverdue ? `Oldest is ${customer.maxDaysOverdue} days late` : "Nothing late"} accent="danger" />
        <StatTile label="Being followed up" value={String(customer.openCases)} helper={`${customer.cases.length} bills followed up so far`} />
        <StatTile label="Pay dates kept" value={`${kept} / ${kept + broken}`} helper={kept + broken ? "Paid on time vs. dates given" : "No pay dates yet"} accent="success" />
      </section>

      <article className="panel overflow-hidden">
        <SectionTitle title="Bills being followed up" helper="Unpaid first, most urgent on top" />
        <CasesTable cases={customer.cases} />
      </article>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="panel overflow-hidden">
          <SectionTitle title="All bills" helper={`${customer.invoices.length} on record`} />
          <div className="scrollbar max-h-[420px] overflow-auto">
            <table className="table-base">
              <thead><tr><th scope="col">Bill</th><th scope="col">Due</th><th scope="col" className="text-right">Unpaid</th><th scope="col">Status</th></tr></thead>
              <tbody>{customer.invoices.map((invoice) => <tr key={invoice.id}><td className="font-mono text-[12px]">{invoice.invoiceNumber}</td><td className="tabular text-muted">{formatDate(invoice.dueDate)}</td><td className="tabular text-right">{formatMoney(invoice.amountOutstanding, invoice.currency)}</td><td><StatusBadge value={invoice.status} /></td></tr>)}</tbody>
            </table>
          </div>
        </article>
        <article className="panel overflow-hidden">
          <SectionTitle title="Payments" helper={`${customer.payments.length} matched to this customer`} />
          <div className="scrollbar max-h-[420px] overflow-auto">
            {customer.payments.length === 0 ? <EmptyState icon={HandCoins} title="No payments recorded" body="Payments matched to this customer's invoices appear here." /> : (
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

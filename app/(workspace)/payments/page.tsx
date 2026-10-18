import type { Metadata } from "next";
import Link from "next/link";
import { FileUp, HandCoins } from "lucide-react";
import { PaymentReview } from "@/components/payment-review";
import { RegionFilter, regionParam } from "@/components/region-filter";
import { EmptyState, PageHeader, Pagination, StatusBadge, Tabs, formatDate } from "@/components/ui";
import { canManage, getPageContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { withRegion } from "@/lib/data/repository";
import { formatMoney } from "@/lib/domain/money";
import type { Payment } from "@/lib/domain/types";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
const VIEWS: Array<{ key: "all" | Payment["matchStatus"]; label: string }> = [{ key: "all", label: "All" }, { key: "matched", label: "Matched" }, { key: "payment_match_review_required", label: "Needs review" }, { key: "unmatched", label: "Unmatched" }];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; region?: string; page?: string }> }) {
  const params = await searchParams;
  const context = await getPageContext();
  const view = VIEWS.find((item) => item.key === params.status)?.key ?? "all";
  const region = regionParam(params.region);
  const scope = withRegion(context, region);
  const all = await repository.listPayments(scope);
  const regions = await repository.regions(context);
  const review = all.filter((item) => item.matchStatus === "payment_match_review_required");
  const candidates = new Map(await Promise.all(review.map(async (payment) => [payment.id, await repository.paymentCandidates(scope, payment.id)] as const)));
  const rows = view === "all" ? all : all.filter((item) => item.matchStatus === view);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number(params.page) || 1));
  const href = (status: string, nextPage?: number, nextRegion = region) => { const query = new URLSearchParams(); if (status !== "all") query.set("status", status); if (nextRegion) query.set("region", nextRegion); if (nextPage && nextPage > 1) query.set("page", String(nextPage)); return `/payments${query.size ? `?${query}` : ""}`; };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Reconciliation" title="Every rupee, accounted for." muted="Ambiguous bank entries are never applied on a guess." actions={context.regions === null && <Link href="/imports" className="btn-outline"><FileUp size={15} /> Import bank file</Link>}>
        <RegionFilter regions={regions} active={region} hrefFor={(next) => href(view, 1, next)} />
        {(region || context.regions !== null) && <p className="mt-3 max-w-xl text-[13px] text-muted">Payments not yet tied to a customer belong to no region. {context.regions === null ? "Clear the region filter to see them." : "A user with access to every region matches them."}</p>}
      </PageHeader>

      {review.length > 0 && (
        <section aria-label="Payments needing review" className="space-y-4">
          {review.map((payment) => (
            <article key={payment.id} className="panel grid gap-6 p-5 md:p-6 lg:grid-cols-[300px_minmax(0,1fr)]">
              <div>
                <StatusBadge value={payment.matchStatus} />
                <p className="tabular mt-4 text-[30px] font-medium leading-none tracking-[-0.04em]">{formatMoney(payment.amount)}</p>
                <dl className="mt-4 space-y-1.5 text-[13px]">
                  <div className="flex gap-2"><dt className="text-muted">Reference</dt><dd className="font-mono text-[12px]">{payment.paymentReference}</dd></div>
                  <div className="flex gap-2"><dt className="text-muted">Received</dt><dd>{formatDate(payment.paymentDate)}</dd></div>
                </dl>
                <p className="mt-4 rounded-xl bg-canvas p-3 text-[12.5px] leading-5 text-muted">{payment.matchNotes}</p>
              </div>
              <PaymentReview paymentId={payment.id} readOnly={!canManage(context)} candidates={(candidates.get(payment.id) ?? []).map((candidate) => ({ invoiceId: candidate.invoice.id, invoiceNumber: candidate.invoice.invoiceNumber, customerName: candidate.customerName, outstanding: formatMoney(candidate.invoice.amountOutstanding, candidate.invoice.currency), dueDate: formatDate(candidate.invoice.dueDate), reason: candidate.reason }))} />
            </article>
          ))}
        </section>
      )}

      <div className="panel overflow-hidden">
        <div className="border-b border-line px-3 pt-1">
          <Tabs active={view} items={VIEWS.map((item) => ({ key: item.key, label: item.label, href: href(item.key), count: item.key === "all" ? all.length : all.filter((payment) => payment.matchStatus === item.key).length }))} />
        </div>
        {rows.length === 0 ? <EmptyState icon={HandCoins} title="No payments in this view" /> : (
          <div className="scrollbar overflow-x-auto">
            <table className="table-base min-w-[820px]">
              <thead><tr><th scope="col">Reference</th><th scope="col">Date</th><th scope="col">Applied to</th><th scope="col" className="text-right">Amount</th><th scope="col">Match</th><th scope="col">Notes</th></tr></thead>
              <tbody>
                {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((payment) => (
                  <tr key={payment.id}>
                    <td className="font-mono text-[12px]">{payment.paymentReference}</td>
                    <td className="tabular text-muted">{formatDate(payment.paymentDate)}</td>
                    <td>{payment.invoiceNumber ? <><span className="block font-medium">{payment.customerName}</span><span className="font-mono text-[11.5px] text-muted">{payment.invoiceNumber}</span></> : <span className="text-muted">Not applied</span>}</td>
                    <td className="tabular text-right font-medium">{formatMoney(payment.amount)}</td>
                    <td><StatusBadge value={payment.matchStatus} /></td>
                    <td className="max-w-[260px] truncate text-[13px] text-muted">{payment.matchNotes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageCount={pageCount} total={rows.length} label="payments" hrefFor={(next) => href(view, next)} />
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Spinner, cx } from "./ui";

export interface ReviewCandidate { invoiceId: string; invoiceNumber: string; customerName: string; outstanding: string; dueDate: string; reason: string }

export function PaymentReview({ paymentId, candidates }: { paymentId: string; candidates: ReviewCandidate[] }) {
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function apply() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/payments/${paymentId}/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoiceId: selected }) });
      if (!response.ok) throw new Error((await response.json()).error || "Could not apply the match");
      setApplied(true);
      setTimeout(() => startTransition(() => router.refresh()), 800);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not apply the match");
    } finally {
      setBusy(false);
    }
  }

  if (candidates.length === 0) return <p className="text-[13px] text-muted">No unpaid bill fits this payment. Leave it unmatched and ask the payer what it was for.</p>;
  return (
    <fieldset>
      <legend className="eyebrow mb-3">Which bill is this for?</legend>
      <div className="stagger-in space-y-2">
        {candidates.map((candidate) => (
          <label key={candidate.invoiceId} className={cx("flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-[border-color,background-color,box-shadow] duration-200", selected === candidate.invoiceId ? "border-ink bg-canvas shadow-[0_0_0_3px_rgb(10_12_16/0.06)]" : "border-line hover:border-line-strong")}>
            <input type="radio" name={`payment-${paymentId}`} value={candidate.invoiceId} checked={selected === candidate.invoiceId} onChange={() => setSelected(candidate.invoiceId)} className="size-4 accent-[var(--ink)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium">{candidate.customerName} <span className="font-mono text-[11.5px] font-normal text-muted">· {candidate.invoiceNumber}</span></span>
              <span className="block text-[12.5px] text-muted">{candidate.reason} · due {candidate.dueDate}</span>
            </span>
            <span className="tabular text-[13.5px] font-medium">{candidate.outstanding}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {applied
          ? <span role="status" className="animate-pop inline-flex min-h-10 items-center gap-2 rounded-full bg-brand-soft px-4 text-[13px] font-medium text-success"><CheckCircle2 size={15} aria-hidden="true" /> Matched</span>
          : <button type="button" disabled={!selected || busy} onClick={apply} className="btn-primary">{busy && <Spinner />}{busy ? "Matching…" : "Match to this bill"}</button>}
        <p className="text-[12.5px] text-muted">This updates the bill, closes it if fully paid, and is saved in the history.</p>
      </div>
      {error && <p role="alert" className="animate-rise mt-3 text-[13px] text-danger">{error}</p>}
    </fieldset>
  );
}

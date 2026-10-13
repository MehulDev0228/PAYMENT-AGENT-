"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cx } from "./ui";

export interface ReviewCandidate { invoiceId: string; invoiceNumber: string; customerName: string; outstanding: string; dueDate: string; reason: string }

export function PaymentReview({ paymentId, candidates }: { paymentId: string; candidates: ReviewCandidate[] }) {
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function apply() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/payments/${paymentId}/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoiceId: selected }) });
      if (!response.ok) throw new Error((await response.json()).error || "Could not apply the match");
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not apply the match");
    } finally {
      setBusy(false);
    }
  }

  if (candidates.length === 0) return <p className="text-[13px] text-muted">No open invoice is a plausible match. Leave unapplied and contact the payer.</p>;
  return (
    <fieldset>
      <legend className="eyebrow mb-3">Candidate invoices</legend>
      <div className="space-y-2">
        {candidates.map((candidate) => (
          <label key={candidate.invoiceId} className={cx("flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors", selected === candidate.invoiceId ? "border-ink bg-canvas" : "border-line hover:border-line-strong")}>
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
        <button type="button" disabled={!selected || busy} onClick={apply} className="btn-primary">{busy ? "Applying…" : "Apply match"}</button>
        <p className="text-[12.5px] text-muted">Applying updates the invoice balance, closes settled cases and is recorded in the audit log.</p>
      </div>
      {error && <p role="alert" className="mt-3 text-[13px] text-danger">{error}</p>}
    </fieldset>
  );
}

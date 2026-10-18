"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Download, Eye, FileSpreadsheet, UploadCloud } from "lucide-react";
import type { FieldChange, ImportResult, InvoiceSyncResult, InvoiceSyncRow } from "@/lib/data/repository";
import { StatusBadge, cx } from "./ui";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_LISTED_ROWS = 200;

const FIELD_LABELS: Record<string, string> = {
  dueDate: "Due date", amount: "Amount", amountPaid: "Paid", amountOutstanding: "Outstanding", status: "Status", erpOutstanding: "ERP balance",
  reconciliationStatus: "Reconciliation", "customer.name": "Customer", "customer.email": "Email", "customer.phone": "Phone",
  "customer.region": "Region", "customer.accountManager": "Account manager",
};
const OUTCOMES = [["new", "New"], ["updated", "Updated"], ["unchanged", "Unchanged"], ["flagged", "Flagged"], ["rejected", "Rejected"]] as const;

export function ImportPanel({ kind, n }: { kind: "invoices" | "payments"; n: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [fullLedger, setFullLedger] = useState(false);
  const [result, setResult] = useState<ImportResult | InvoiceSyncResult>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const invoices = kind === "invoices";
  const sync = result && "counts" in result ? result : undefined;
  const previewing = sync?.dryRun === true;

  function choose(next?: File) {
    setResult(undefined); setError("");
    if (next && next.size > MAX_BYTES) { setError("File is larger than 10 MB. Split it and import in parts."); return; }
    if (next && !/\.(csv|xlsx)$/i.test(next.name)) { setError("Only .csv and .xlsx files are supported."); return; }
    setFile(next);
  }

  async function upload(mode: "preview" | "commit") {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const body = new FormData(); body.append("file", file);
      if (invoices) { body.append("mode", mode); body.append("fullLedger", String(fullLedger)); }
      const response = await fetch(`/api/${kind}/import`, { method: "POST", body });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Import failed");
      setResult(json);
      if (mode === "commit") startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel flex flex-col p-5 md:p-6">
      <div className="flex items-start justify-between">
        <span className="grid size-10 place-items-center rounded-xl bg-ink text-glow"><FileSpreadsheet size={18} aria-hidden="true" /></span>
        <span className="font-mono text-[11px] text-muted">{n}</span>
      </div>
      <h2 className="mt-5 text-[17px] font-medium capitalize tracking-[-0.025em]">{kind}</h2>
      <p className="mt-1.5 text-[13.5px] leading-6 text-muted">{invoices ? "Upload today's open-invoice export from your ERP or Excel sheet. New invoices are added, known ones refreshed, and anything that disagrees with AERA is flagged instead of overwritten." : "Bank statement or payment gateway export. Each row is matched deterministically or held for review."}</p>
      <button type="button" onClick={() => inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files?.[0]); }}
        className={cx("mt-5 flex min-h-36 w-full flex-col items-center justify-center rounded-xl border border-dashed px-4 text-center transition-colors", dragging ? "border-brand bg-brand-soft" : "border-line-strong bg-canvas hover:border-ink")}>
        <UploadCloud size={22} className="text-ink" aria-hidden="true" />
        <span className="mt-3 text-sm font-medium">{file ? file.name : "Drop a CSV or XLSX, or browse"}</span>
        <span className="mt-1 text-[12px] text-muted">{file ? `${(file.size / 1024).toFixed(1)} KB` : "Up to 10 MB"}</span>
      </button>
      <input ref={inputRef} className="sr-only" type="file" accept=".csv,.xlsx" onChange={(event) => choose(event.target.files?.[0])} tabIndex={-1} aria-hidden="true" />
      {invoices && (
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[13px] leading-5">
          <input type="checkbox" className="mt-0.5 size-4 accent-ink" checked={fullLedger} onChange={(event) => { setFullLedger(event.target.checked); setResult(undefined); }} />
          <span><span className="font-medium">This file is the full open ledger.</span> <span className="text-muted">Open invoices it does not list are flagged for review and their reminders paused. Nothing is closed automatically.</span></span>
        </label>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {invoices ? (
          previewing
            ? <>
                <button type="button" disabled={busy} onClick={() => upload("commit")} className="btn-primary">{busy ? "Applying…" : "Apply sync"}</button>
                <button type="button" disabled={busy} onClick={() => setResult(undefined)} className="btn-outline">Cancel</button>
              </>
            : <button type="button" disabled={!file || busy} onClick={() => upload("preview")} className="btn-primary"><Eye size={15} aria-hidden="true" /> {busy ? "Checking…" : "Preview changes"}</button>
        ) : (
          <button type="button" disabled={!file || busy} onClick={() => upload("commit")} className="btn-primary">{busy ? "Validating…" : "Import and validate"}</button>
        )}
        <a className="btn-outline" href={`/templates/${invoices ? "invoice" : "payment"}-import.csv`} download><Download size={15} aria-hidden="true" /> Template</a>
      </div>
      {error && <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-[#fdecea] p-3 text-[13px] text-danger"><CircleAlert size={15} className="mt-0.5 shrink-0" />{error}</p>}
      {sync && <SyncSummary result={sync} />}
      {result && !sync && (
        <div aria-live="polite" className="animate-rise mt-4 rounded-xl border border-line bg-canvas p-4">
          <p className="flex items-center gap-2 text-[13.5px] font-medium"><CheckCircle2 size={15} className="text-success" /> Import complete</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[["Imported", result.imported], ["Rejected", result.rejected], ["Need review", result.reviewRequired]].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-surface py-2.5"><dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</dt><dd className="tabular mt-1 text-lg font-medium">{value}</dd></div>
            ))}
          </dl>
          {result.errors.length > 0 && <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto font-mono text-[11.5px] text-danger">{result.errors.map((item) => <li key={`${item.row}-${item.message}`}>Row {item.row}: {item.message}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

function SyncSummary({ result }: { result: InvoiceSyncResult }) {
  const listed = result.rows.slice(0, MAX_LISTED_ROWS);
  return (
    <div aria-live="polite" className="animate-rise mt-4 rounded-xl border border-line bg-canvas p-4">
      <p className="flex items-center gap-2 text-[13.5px] font-medium">
        {result.dryRun
          ? <><Eye size={15} className="text-brand" /> Preview: nothing has been saved yet</>
          : <><CheckCircle2 size={15} className="text-success" /> Sync complete</>}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
        {OUTCOMES.map(([key, label]) => (
          <div key={key} className="rounded-lg bg-surface py-2.5"><dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</dt><dd className={cx("tabular mt-1 text-lg font-medium", key === "flagged" && result.counts.flagged > 0 && "text-warning", key === "rejected" && result.counts.rejected > 0 && "text-danger")}>{result.counts[key]}</dd></div>
        ))}
      </dl>
      {listed.length > 0 && (
        <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface">
          {listed.map((row) => <SyncRowItem key={`${row.row ?? "missing"}-${row.invoiceNumber}`} row={row} />)}
        </ul>
      )}
      {result.rows.length > listed.length && <p className="mt-2 text-[12px] text-muted">Showing the first {MAX_LISTED_ROWS} of {result.rows.length} rows with changes.</p>}
      {result.dryRun && <p className="mt-3 text-[12px] leading-5 text-muted">Unchanged rows are not listed. Apply the sync to save these changes; each one is written to the audit trail with its before and after values.</p>}
    </div>
  );
}

function SyncRowItem({ row }: { row: InvoiceSyncRow }) {
  return (
    <li className="px-3 py-2.5 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-muted">{row.row ? `Row ${row.row}` : "Not in file"}</span>
        <span className="font-mono text-[12px] font-medium">{row.invoiceNumber || "—"}</span>
        <StatusBadge value={row.outcome} />
        {row.reconciliation && <StatusBadge value={row.reconciliation} />}
      </div>
      {row.changes.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-muted">
          {row.changes.map((change) => <li key={change.field}><span className="text-ink">{FIELD_LABELS[change.field] ?? change.field}</span>: {formatValue(change.before)} → {formatValue(change.after)}</li>)}
        </ul>
      )}
      {row.message && <p className={cx("mt-1.5", row.outcome === "rejected" ? "text-danger" : "text-muted")}>{row.message}</p>}
    </li>
  );
}

function formatValue(value: FieldChange["before"]) {
  if (value === null || value === "") return "—";
  return typeof value === "number" ? value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(value).replaceAll("_", " ");
}

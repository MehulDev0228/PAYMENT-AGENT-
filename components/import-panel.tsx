"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import type { ImportResult } from "@/lib/data/repository";
import { CountUp } from "./motion";
import { Spinner, cx } from "./ui";

const MAX_BYTES = 10 * 1024 * 1024;

export function ImportPanel({ kind, n }: { kind: "invoices" | "payments"; n: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [result, setResult] = useState<ImportResult>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function choose(next?: File) {
    setResult(undefined); setError("");
    if (next && next.size > MAX_BYTES) { setError("File is larger than 10 MB. Split it and import in parts."); return; }
    if (next && !/\.(csv|xlsx)$/i.test(next.name)) { setError("Only .csv and .xlsx files are supported."); return; }
    setFile(next);
  }

  async function upload() {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const body = new FormData(); body.append("file", file);
      const response = await fetch(`/api/${kind}/import`, { method: "POST", body });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Import failed");
      setResult(json);
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel relative flex flex-col overflow-hidden p-5 md:p-6">
      {busy && <span className="animate-fade-in absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-glow/15" aria-hidden="true"><span className="animate-progress block h-full w-1/3 rounded-full bg-glow" /></span>}
      <div className="flex items-start justify-between">
        <span className="grid size-10 place-items-center rounded-xl bg-ink text-glow"><FileSpreadsheet size={18} aria-hidden="true" /></span>
        <span className="font-mono text-[11px] text-muted">{n}</span>
      </div>
      <h2 className="mt-5 text-[16px] font-medium tracking-[-0.025em]">{kind === "invoices" ? "Unpaid bills" : "Bank statement"}</h2>
      <p className="mt-1.5 text-[13.5px] leading-6 text-muted">{kind === "invoices" ? "Just four columns: bill number, customer email, amount due and due date. Export from Tally, Excel or any accounting tool." : "Your bank or payment gateway export. Each payment is matched to its bill, or waits for you if it is unclear."}</p>
      <button type="button" onClick={() => inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files?.[0]); }}
        className={cx("group mt-5 flex min-h-36 w-full flex-col items-center justify-center rounded-xl border border-dashed px-4 text-center transition-[border-color,background-color,transform] duration-200", dragging ? "scale-[1.01] border-brand bg-brand-soft" : "border-line-strong bg-canvas hover:border-ink")}>
        <UploadCloud size={22} className={cx("transition-transform duration-300", dragging ? "-translate-y-1 scale-110 text-brand" : "text-ink group-hover:-translate-y-0.5")} aria-hidden="true" />
        <span key={file?.name ?? "empty"} className={cx("mt-3 text-sm font-medium", file && "animate-pop")}>{file ? file.name : "Drop a CSV or XLSX, or browse"}</span>
        <span className="mt-1 text-[12px] text-muted">{file ? `${(file.size / 1024).toFixed(1)} KB` : "Up to 10 MB"}</span>
      </button>
      <input ref={inputRef} className="sr-only" type="file" accept=".csv,.xlsx" onChange={(event) => choose(event.target.files?.[0])} tabIndex={-1} aria-hidden="true" />
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={!file || busy} onClick={upload} className="btn-primary">{busy && <Spinner />}{busy ? "Checking…" : "Upload and check"}</button>
        <a className="btn-outline" href={`/templates/${kind === "invoices" ? "invoice" : "payment"}-import.csv`} download><Download size={15} aria-hidden="true" /> Sample file</a>
      </div>
      {error && <p role="alert" className="animate-rise mt-4 flex items-start gap-2 rounded-xl bg-[#fdecea] p-3 text-[13px] text-danger"><CircleAlert size={15} className="mt-0.5 shrink-0" />{error}</p>}
      {result && (
        <div aria-live="polite" className="animate-rise mt-4 rounded-xl border border-line bg-canvas p-4">
          <p className="flex items-center gap-2 text-[13.5px] font-medium"><CheckCircle2 size={15} className="text-success" /> Upload done</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[["Added", result.imported], ["Skipped", result.rejected], ["Check match", result.reviewRequired]].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-surface py-2.5"><dt className="eyebrow text-[10px]">{label}</dt><dd className="mt-1 text-lg font-medium"><CountUp value={String(value)} duration={700} /></dd></div>
            ))}
          </dl>
          {result.ignoredColumns && result.ignoredColumns.length > 0 && <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-[12px] text-muted">Ignored and not stored: {result.ignoredColumns.join(", ")}</p>}
          {result.errors.length > 0 && <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto font-mono text-[11.5px] text-danger">{result.errors.map((item) => <li key={`${item.row}-${item.message}`}>Row {item.row}: {item.message}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

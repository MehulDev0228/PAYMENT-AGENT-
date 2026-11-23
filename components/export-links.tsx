import { Download } from "lucide-react";

/** Download links for the current view: Excel (.xlsx) first, CSV as the fallback. `query` is the page's active filters. */
export function ExportLinks({ report, query, label = "Export" }: { report: "cases" | "customers" | "payments" | "ageing"; query?: Record<string, string | undefined>; label?: string }) {
  const href = (format: "xlsx" | "csv") => {
    const params = new URLSearchParams(Object.entries(query ?? {}).filter((entry): entry is [string, string] => Boolean(entry[1])));
    if (format === "csv") params.set("format", "csv");
    return `/api/export/${report}${params.size ? `?${params}` : ""}`;
  };
  return (
    <div className="inline-flex items-center gap-1">
      <a href={href("xlsx")} download className="btn-outline"><Download size={15} aria-hidden="true" /> {label} Excel</a>
      <a href={href("csv")} download className="btn-ghost" aria-label={`${label} as CSV`}>CSV</a>
    </div>
  );
}

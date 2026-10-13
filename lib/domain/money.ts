export function formatMoney(amount: number, currency = "INR", compact = false): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  }).format(amount);
}

export function daysBetween(earlier: string, later: Date): number {
  const start = new Date(`${earlier.slice(0, 10)}T00:00:00Z`).getTime();
  const end = Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate());
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

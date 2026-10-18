/**
 * Regions are free text on customers (imported from the region column of an invoice sheet).
 * They compare case- and whitespace-insensitively, so "North", "north" and " North " are one region.
 */

export const regionKey = (region: string | null | undefined) => region?.trim().toLowerCase() ?? "";

/** True when a customer's region is one of `regions`. `null` means every region; a customer without a region is only in that one. */
export function inRegions(region: string | null | undefined, regions: readonly string[] | null): boolean {
  if (regions === null) return true;
  const key = regionKey(region);
  return key !== "" && regions.some((item) => regionKey(item) === key);
}

/**
 * Parses a region list such as "North, West". Returns null for "all" (every region) and
 * de-duplicates case-insensitively. Throws on an empty list, which would hide everything.
 */
export function parseRegions(value: string): string[] | null {
  if (value.trim().toLowerCase() === "all") return null;
  const regions: string[] = [];
  for (const item of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (!regions.some((existing) => regionKey(existing) === regionKey(item))) regions.push(item);
  }
  if (!regions.length) throw new Error('Give at least one region, e.g. "North,West", or "all"');
  return regions;
}

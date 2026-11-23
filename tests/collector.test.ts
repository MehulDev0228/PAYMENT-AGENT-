import { describe, expect, it } from "vitest";
import { ageingBucket, resolveAssigneeFilter } from "@/lib/domain/collector";
import { exportFileName, toCsv, type ExportTable } from "@/lib/exports";

describe("ageing bands", () => {
  it("splits at 30, 60 and 90 days past due", () => {
    expect([0, 1, 30, 31, 60, 61, 90, 91].map(ageingBucket)).toEqual(["notDue", "days1to30", "days1to30", "days31to60", "days31to60", "days61to90", "days61to90", "days90plus"]);
  });
});

describe("assignee filter", () => {
  it("maps me, none and user ids", () => {
    expect(resolveAssigneeFilter("me", "u-1")).toBe("u-1");
    expect(resolveAssigneeFilter("none", "u-1")).toBeNull();
    expect(resolveAssigneeFilter("u-2", "u-1")).toBe("u-2");
    expect(resolveAssigneeFilter("", "u-1")).toBeUndefined();
    expect(resolveAssigneeFilter(null, "u-1")).toBeUndefined();
  });
});

describe("CSV export", () => {
  const sheet = (rows: ExportTable["rows"], totals?: ExportTable["totals"]): ExportTable => ({ sheet: "Test", columns: [{ header: "Name" }, { header: "Amount", kind: "money" }], rows, totals });

  it("starts with a BOM, uses CRLF and quotes what needs quoting", () => {
    const csv = toCsv(sheet([["Atlas, Foods", 1200.5], ['He said "pay"', null], ["Two\nlines", 0]]));
    expect(csv.startsWith("﻿Name,Amount\r\n")).toBe(true);
    expect(csv).toContain('"Atlas, Foods",1200.5\r\n');
    expect(csv).toContain('"He said ""pay""",\r\n');
    expect(csv).toContain('"Two\nlines",0\r\n');
  });

  it("neutralises formulas but leaves phone numbers and negatives alone", () => {
    const csv = toCsv(sheet([["=1+1", 1], ["@SUM(A1)", 2], ["-2+cmd|' /C calc'!A0", 3], ["+91 90000 00081", 4], ["-1500", 5]]));
    expect(csv).toContain("'=1+1,1");
    expect(csv).toContain("'@SUM(A1),2");
    expect(csv).toContain("'-2+cmd|' /C calc'!A0,3");
    expect(csv).toContain("\r\n+91 90000 00081,4");
    expect(csv).toContain("\r\n-1500,5");
  });

  it("appends the totals row", () => {
    expect(toCsv(sheet([["A", 1]], ["Total", 1])).trimEnd().split("\r\n").at(-1)).toBe("Total,1");
  });

  it("names files after the report and business date", () => {
    expect(exportFileName("cases", "2026-09-27", "xlsx")).toBe("kindlypay-cases-2026-09-27.xlsx");
    expect(exportFileName("ageing-2026-09-27", "2026-09-27", "csv")).toBe("kindlypay-ageing-2026-09-27.csv");
  });
});

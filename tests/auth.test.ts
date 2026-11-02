import { describe, expect, it } from "vitest";
import { AccountError, signIn, signUp } from "@/lib/data/accounts";
import { repository } from "@/lib/data";
import { INVOICE_COLUMNS, pickColumns } from "@/lib/imports";
import { createSessionToken, hashPassword, readSession, sessionFromCookieHeader, verifyPassword } from "@/lib/session";

const person = { userId: "u1", companyId: "c1", companyName: "CityBond", name: "Asha Rao", email: "asha@citybond.test", role: "admin" as const };

describe("sessions", () => {
  it("round-trips a signed session", () => {
    expect(readSession(createSessionToken(person))).toMatchObject(person);
  });

  it("rejects a session whose payload was edited", () => {
    const [payload, signature] = createSessionToken(person).split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), companyId: "someone-else" })).toString("base64url");
    expect(readSession(`${forged}.${signature}`)).toBeNull();
  });

  it("rejects an expired session", () => {
    expect(readSession(createSessionToken(person, -1))).toBeNull();
  });

  it("reads the session out of a cookie header", () => {
    expect(sessionFromCookieHeader(`theme=dark; kp_session=${encodeURIComponent(createSessionToken(person))}`)?.email).toBe(person.email);
    expect(sessionFromCookieHeader("theme=dark")).toBeNull();
  });
});

describe("passwords", () => {
  it("verifies the right password and rejects a wrong one", () => {
    const stored = hashPassword("correct horse battery");
    expect(stored).not.toContain("correct horse");
    expect(verifyPassword("correct horse battery", stored)).toBe(true);
    expect(verifyPassword("wrong horse battery", stored)).toBe(false);
  });
});

describe("accounts (demo adapter)", () => {
  it("signs up into a new empty company, then signs in", async () => {
    const account = await signUp({ companyName: "CityBond Traders", name: "Asha Rao", email: "Owner@CityBond.test", password: "a-long-password" });
    expect(account).toMatchObject({ companyName: "CityBond Traders", email: "owner@citybond.test", role: "admin" });
    expect(await repository.listCustomers(account.companyId)).toEqual([]);
    expect((await repository.policy(account.companyId)).steps.length).toBeGreaterThan(0);
    expect((await signIn("owner@citybond.test", "a-long-password")).id).toBe(account.id);
  });

  it("refuses a duplicate email and a wrong password with the same message for unknown emails", async () => {
    await signUp({ companyName: "Dup Co", name: "Dup", email: "dup@citybond.test", password: "a-long-password" });
    await expect(signUp({ companyName: "Dup Co 2", name: "Dup", email: "dup@citybond.test", password: "another-password" })).rejects.toBeInstanceOf(AccountError);
    await expect(signIn("dup@citybond.test", "nope-nope-nope")).rejects.toThrow("That email and password don't match.");
    await expect(signIn("nobody@citybond.test", "nope-nope-nope")).rejects.toThrow("That email and password don't match.");
  });

  it("keeps each new company's bills separate", async () => {
    const a = await signUp({ companyName: "A Co", name: "A", email: "a@iso.test", password: "a-long-password" });
    const b = await signUp({ companyName: "B Co", name: "B", email: "b@iso.test", password: "a-long-password" });
    await repository.importInvoices(a.companyId, [{ invoice_number: "A-1", customer_email: "pay@buyer.test", amount: 5000, due_date: "2026-09-01" }]);
    expect(await repository.listCustomers(a.companyId)).toHaveLength(1);
    expect(await repository.listCustomers(b.companyId)).toEqual([]);
  });
});

describe("four-column upload", () => {
  it("maps everyday column names, drops everything else, and fills in the rest", async () => {
    const { rows, ignored } = pickColumns([{ "Bill No.": "B-7", "Email": "accounts@bluebird-foods.example", "Amount due": "12,500", "Due Date": "2026-09-10", "Rate": "0.75", "Qty": "100" }], INVOICE_COLUMNS);
    expect(ignored).toEqual(["Rate", "Qty"]);
    expect(rows[0]).toEqual({ invoice_number: "B-7", customer_email: "accounts@bluebird-foods.example", amount: "12,500", due_date: "2026-09-10" });

    const { companyId } = await signUp({ companyName: "Upload Co", name: "U", email: "u@upload.test", password: "a-long-password" });
    const result = await repository.importInvoices(companyId, [{ invoice_number: "B-7", customer_email: "accounts@bluebird-foods.example", amount: 12500, due_date: "2026-09-10" }]);
    expect(result).toMatchObject({ imported: 1, rejected: 0 });
    const [customer] = await repository.listCustomers(companyId);
    expect(customer?.name).toBe("Bluebird Foods");
  });
});

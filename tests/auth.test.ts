import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";
import { AuthError, canManage, requireManager, resolveAuthMode, resolveRequestContext, type AuthEnv, type ContextSource, type UserProfile } from "@/lib/auth/context";
import { applyMigrations, createCompany } from "@/lib/data/db-setup";
import { createPostgresRepository } from "@/lib/data/postgres-repository";
import { DEMO_COMPANY_ID } from "@/lib/data/seed";
import type { SqlClient, SqlDatabase } from "@/lib/data/sql";
import { createWorkspaceForUser } from "@/lib/auth/workspace";
import { createMockRepository } from "@/lib/data/mock-repository";
import { companyScope } from "@/lib/data/repository";
import { findUserProfile, upsertWorkspaceUser } from "@/lib/data/users";
import { INVOICE_COLUMNS, parseInvoiceRows, pickColumns } from "@/lib/imports";

const ACME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ASHA = "33333333-3333-4333-8333-333333333333";
const TOKEN = "automation-secret-token";

const SUPABASE: AuthEnv = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", KINDLYPAY_DATA_ADAPTER: "postgres" };

const profile = (role: UserProfile["role"], regions: string[] | null = null): UserProfile => ({ id: ASHA, companyId: ACME, companyName: "Acme", role, name: "Asha Rao", email: "asha@acme.example", regions });

/** A request source with an Acme session, unless overridden. */
function source(overrides: Partial<ContextSource> = {}): ContextSource {
  return { sessionUser: async () => ({ id: ASHA }), findProfile: async (id) => (id === ASHA ? profile("finance_manager") : null), ...overrides };
}

async function authError(promise: Promise<unknown>): Promise<AuthError> {
  const error = await promise.then(() => undefined, (cause: unknown) => cause);
  expect(error).toBeInstanceOf(AuthError);
  return error as AuthError;
}

describe("auth mode", () => {
  it("runs without authentication when nothing is configured", () => {
    expect(resolveAuthMode({})).toBe("dev");
    expect(resolveAuthMode({ NODE_ENV: "production" })).toBe("dev");
  });

  it("switches to Supabase Auth when a Supabase project is configured", () => {
    expect(resolveAuthMode(SUPABASE)).toBe("supabase");
  });

  it("refuses dev mode against a database in production", () => {
    expect(() => resolveAuthMode({ KINDLYPAY_AUTH_MODE: "dev", KINDLYPAY_DATA_ADAPTER: "postgres", NODE_ENV: "production" })).toThrow(/cannot be used with a database in production/);
    expect(resolveAuthMode({ KINDLYPAY_AUTH_MODE: "dev", KINDLYPAY_DATA_ADAPTER: "postgres", NODE_ENV: "development" })).toBe("dev");
  });

  it("refuses Supabase Auth without keys or without the postgres adapter", () => {
    expect(() => resolveAuthMode({ KINDLYPAY_AUTH_MODE: "supabase", KINDLYPAY_DATA_ADAPTER: "postgres" })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => resolveAuthMode({ ...SUPABASE, KINDLYPAY_DATA_ADAPTER: "mock" })).toThrow(/KINDLYPAY_DATA_ADAPTER=postgres/);
    expect(() => resolveAuthMode({ KINDLYPAY_AUTH_MODE: "none" })).toThrow(/Unknown KINDLYPAY_AUTH_MODE/);
  });
});

describe("Supabase session context", () => {
  it("takes company, user and role from the public.users row", async () => {
    expect(await resolveRequestContext(source(), SUPABASE)).toEqual({ companyId: ACME, companyName: "Acme", userId: ASHA, role: "finance_manager", name: "Asha Rao", email: "asha@acme.example", mode: "supabase", regions: null });
  });

  it("carries the user's regions from public.users", async () => {
    const regional = source({ findProfile: async () => profile("collection_manager", ["North", "West"]) });
    expect(await resolveRequestContext(regional, SUPABASE)).toMatchObject({ companyId: ACME, role: "collection_manager", regions: ["North", "West"] });
  });

  it("answers 401 without a session", async () => {
    expect((await authError(resolveRequestContext(source({ sessionUser: async () => null }), SUPABASE))).status).toBe(401);
  });

  it("answers 403 for a signed-in user who is not provisioned in any company", async () => {
    expect((await authError(resolveRequestContext(source({ findProfile: async () => null }), SUPABASE))).status).toBe(403);
  });

  it("ignores spoofed company and bearer headers on ordinary routes", async () => {
    const spoofed = source({ companyHeader: OTHER, authorization: `Bearer ${TOKEN}` });
    const context = await resolveRequestContext(spoofed, { ...SUPABASE, KINDLYPAY_INTERNAL_API_TOKEN: TOKEN, KINDLYPAY_AUTOMATION_COMPANY_ID: OTHER });
    expect(context).toMatchObject({ companyId: ACME, userId: ASHA, role: "finance_manager" });
  });

  it("does not let headers stand in for a missing session", async () => {
    const anonymous = source({ sessionUser: async () => null, companyHeader: ACME });
    expect((await authError(resolveRequestContext(anonymous, SUPABASE))).status).toBe(401);
  });
});

describe("n8n automation token", () => {
  const env: AuthEnv = { ...SUPABASE, KINDLYPAY_INTERNAL_API_TOKEN: TOKEN, KINDLYPAY_AUTOMATION_COMPANY_ID: ACME };
  const n8n = (authorization: string | null, companyHeader?: string) => source({ authorization, companyHeader, acceptsAutomation: true, sessionUser: async () => null });

  it("acts for the company the token is configured for", async () => {
    expect(await resolveRequestContext(n8n(`Bearer ${TOKEN}`), env)).toMatchObject({ companyId: ACME, role: "automation", userId: "automation:n8n" });
    expect(await resolveRequestContext(n8n(`Bearer ${TOKEN}`, ACME), env)).toMatchObject({ companyId: ACME });
  });

  it("rejects an x-company-id that points at another company", async () => {
    expect((await authError(resolveRequestContext(n8n(`Bearer ${TOKEN}`, OTHER), env))).status).toBe(403);
  });

  it("rejects a wrong token, and every token when none is configured", async () => {
    expect((await authError(resolveRequestContext(n8n("Bearer guess"), env))).status).toBe(401);
    expect((await authError(resolveRequestContext(n8n(`Bearer ${TOKEN}`), SUPABASE))).status).toBe(401);
  });

  it("needs KINDLYPAY_AUTOMATION_COMPANY_ID in Supabase mode", async () => {
    await expect(resolveRequestContext(n8n(`Bearer ${TOKEN}`), { ...SUPABASE, KINDLYPAY_INTERNAL_API_TOKEN: TOKEN })).rejects.toThrow(/KINDLYPAY_AUTOMATION_COMPANY_ID/);
  });

  it("still lets a signed-in manager call automation routes without the token", async () => {
    expect(await resolveRequestContext(source({ acceptsAutomation: true }), env)).toMatchObject({ companyId: ACME, role: "finance_manager" });
  });
});

describe("dev mode", () => {
  it("acts as the demo finance manager, whatever the headers say", async () => {
    const context = await resolveRequestContext(source({ companyHeader: OTHER, authorization: "Bearer x" }), {});
    expect(context).toMatchObject({ companyId: DEMO_COMPANY_ID, userId: "user-demo-manager", role: "finance_manager", mode: "dev" });
  });

  it("takes company and role from configuration only", async () => {
    expect(await resolveRequestContext(source(), { KINDLYPAY_DEV_COMPANY_ID: ACME, KINDLYPAY_DEV_ROLE: "viewer" })).toMatchObject({ companyId: ACME, role: "viewer" });
    await expect(resolveRequestContext(source(), { KINDLYPAY_DEV_ROLE: "owner" })).rejects.toThrow(/KINDLYPAY_DEV_ROLE/);
  });

  it("can be limited to some regions for local testing", async () => {
    expect((await resolveRequestContext(source(), {})).regions).toBeNull();
    expect((await resolveRequestContext(source(), { KINDLYPAY_DEV_REGIONS: "North, west" })).regions).toEqual(["North", "west"]);
  });

  it("requires the token on automation routes once one is configured", async () => {
    const env: AuthEnv = { KINDLYPAY_INTERNAL_API_TOKEN: TOKEN };
    expect((await authError(resolveRequestContext(source({ acceptsAutomation: true }), env))).status).toBe(401);
    expect(await resolveRequestContext(source({ acceptsAutomation: true, authorization: `Bearer ${TOKEN}` }), env)).toMatchObject({ companyId: DEMO_COMPANY_ID, role: "automation" });
  });
});

describe("permissions", () => {
  it.each(["admin", "finance_manager", "collection_manager", "automation"] as const)("%s may change data", (role) => {
    expect(canManage({ role })).toBe(true);
    expect(() => requireManager({ role })).not.toThrow();
  });

  it("viewers are read-only", () => {
    expect(canManage({ role: "viewer" })).toBe(false);
    expect(() => requireManager({ role: "viewer" })).toThrow(AuthError);
    try { requireManager({ role: "viewer" }); } catch (error) { expect((error as AuthError).status).toBe(403); }
  });
});

describe("workspace users in PostgreSQL", () => {
  it("links an auth user to a company and reads the profile back", async () => {
    const pg = await PGlite.create({ extensions: { pgcrypto } });
    const client = (target: Pick<PGlite, "query" | "exec">): SqlClient => ({
      query: async <R,>(text: string, params?: unknown[]) => (await target.query<R>(text, params)).rows,
      exec: async (text) => { await target.exec(text); },
    });
    const db: SqlDatabase = { ...client(pg), transaction: (fn) => pg.transaction((tx) => fn(client(tx))) };
    try {
      await applyMigrations(db);
      await createCompany(db, { id: ACME, name: "Acme" });
      await db.query("insert into auth.users (id) values ($1)", [ASHA]);

      expect(await findUserProfile(db, ASHA)).toBeNull();
      await upsertWorkspaceUser(db, { id: ASHA, companyId: ACME, name: "Asha Rao", email: "Asha@Acme.example", role: "viewer" });
      expect(await findUserProfile(db, ASHA)).toEqual({ ...profile("viewer"), email: "asha@acme.example" });

      await upsertWorkspaceUser(db, { id: ASHA, companyId: ACME, name: "Asha Rao", email: "asha@acme.example", role: "collection_manager" });
      expect((await findUserProfile(db, ASHA))?.role).toBe("collection_manager");

      // Regions: set, kept when a later call does not mention them, cleared with null. Never an empty list.
      await upsertWorkspaceUser(db, { id: ASHA, companyId: ACME, name: "Asha Rao", email: "asha@acme.example", role: "collection_manager", regions: ["North", "West"] });
      expect((await findUserProfile(db, ASHA))?.regions).toEqual(["North", "West"]);
      await upsertWorkspaceUser(db, { id: ASHA, companyId: ACME, name: "Asha Rao", email: "asha@acme.example", role: "finance_manager" });
      expect(await findUserProfile(db, ASHA)).toMatchObject({ role: "finance_manager", regions: ["North", "West"] });
      await upsertWorkspaceUser(db, { id: ASHA, companyId: ACME, name: "Asha Rao", email: "asha@acme.example", role: "finance_manager", regions: null });
      expect((await findUserProfile(db, ASHA))?.regions).toBeNull();
      await expect(upsertWorkspaceUser(db, { id: ASHA, companyId: ACME, name: "Asha Rao", email: "asha@acme.example", role: "viewer", regions: [] })).rejects.toThrow(/users_regions_not_empty/);
      expect(await findUserProfile(db, "user-demo-manager")).toBeNull();
    } finally {
      await pg.close();
    }
  }, 60_000);
});

describe("self sign-up", () => {
  it("gives a new user their own empty company, and never moves an existing one", async () => {
    const pg = await PGlite.create({ extensions: { pgcrypto } });
    const client = (target: Pick<PGlite, "query" | "exec">): SqlClient => ({
      query: async <R,>(text: string, params?: unknown[]) => (await target.query<R>(text, params)).rows,
      exec: async (text) => { await target.exec(text); },
    });
    const db: SqlDatabase = { ...client(pg), transaction: (fn) => pg.transaction((tx) => fn(client(tx))) };
    try {
      await applyMigrations(db);
      const repo = createPostgresRepository(db);
      const BOB = "44444444-4444-4444-8444-444444444444";
      await db.query("insert into auth.users (id) values ($1), ($2)", [ASHA, BOB]);

      expect(await createWorkspaceForUser(db, repo.createCompany, { userId: ASHA, email: "Owner@CityBond.test", name: "Asha Rao", companyName: "CityBond Traders" })).toBe("created");
      const asha = (await findUserProfile(db, ASHA))!;
      expect(asha).toMatchObject({ companyName: "CityBond Traders", email: "owner@citybond.test", role: "admin", regions: null });
      expect(await repo.listCustomers(companyScope(asha.companyId))).toEqual([]);
      expect((await repo.policy(companyScope(asha.companyId))).steps.length).toBeGreaterThan(0);

      // Signing up again (or a replayed sign-up) leaves the account where it is.
      expect(await createWorkspaceForUser(db, repo.createCompany, { userId: ASHA, email: "owner@citybond.test", name: "Asha", companyName: "Other Co" })).toBe("exists");
      expect(await findUserProfile(db, ASHA)).toEqual(asha);
      expect(await db.query("select id from public.companies where name = 'Other Co'")).toEqual([]);

      // Each new company's bills stay its own.
      await createWorkspaceForUser(db, repo.createCompany, { userId: BOB, email: "bob@b.test", name: "Bob", companyName: "B Co" });
      const bob = (await findUserProfile(db, BOB))!;
      await repo.importInvoices(companyScope(asha.companyId), [{ invoice_number: "A-1", customer_email: "pay@buyer.test", amount: 5000, due_date: "2026-09-01" }]);
      expect(await repo.listCustomers(companyScope(asha.companyId))).toHaveLength(1);
      expect(await repo.listCustomers(companyScope(bob.companyId))).toEqual([]);
    } finally {
      await pg.close();
    }
  }, 60_000);
});

describe("four-column upload", () => {
  it("maps everyday column names, drops everything else, and fills in the rest", async () => {
    const sheet = [{ "Bill No.": "B-7", "Email": "accounts@bluebird-foods.example", "Amount due": "12,500", "Due Date": "2026-09-10", "Zone": "North", "Rate": "0.75", "Qty": "100" }];
    const { rows: picked, ignored } = pickColumns(sheet, INVOICE_COLUMNS);
    expect(ignored).toEqual(["Rate", "Qty"]);
    expect(picked[0]).toEqual({ invoice_number: "B-7", customer_email: "accounts@bluebird-foods.example", amount: "12,500", due_date: "2026-09-10", region: "North" });

    const { rows, invalidRows } = parseInvoiceRows([...sheet, { "Bill No.": "B-8", "Email": "not-an-email", "Amount due": "10", "Due Date": "2026-09-10" }]);
    expect(rows).toEqual([{ invoice_number: "B-7", customer_email: "accounts@bluebird-foods.example", amount: 12_500, due_date: "2026-09-10", region: "North", row: 2 }]);
    expect(invalidRows).toEqual([{ row: 3, invoiceNumber: "B-8", message: "customer email is not valid" }]);

    const repo = createMockRepository();
    const scope = companyScope(ACME);
    await repo.createCompany({ id: ACME, name: "Upload Co" });
    expect(await repo.importInvoices(scope, rows)).toMatchObject({ imported: 1, rejected: 0 });
    const [customer] = await repo.listCustomers(scope);
    expect(customer).toMatchObject({ name: "Bluebird Foods", region: "North" });
  });

  it("treats a lone balance column as the amount due", () => {
    const { rows } = parseInvoiceRows([{ "Invoice": "C-1", "Email": "ap@c.test", "Balance": "900", "Due": "2026-10-01" }]);
    expect(rows[0]).toMatchObject({ amount: 900, outstanding: undefined });
    const both = parseInvoiceRows([{ "Invoice": "C-1", "Email": "ap@c.test", "Amount due": "1000", "Balance": "900", "Due": "2026-10-01" }]);
    expect(both.rows[0]).toMatchObject({ amount: 1000, outstanding: 900 });
  });
});

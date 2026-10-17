import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";
import { AuthError, canManage, requireManager, resolveAuthMode, resolveRequestContext, type AuthEnv, type ContextSource, type UserProfile } from "@/lib/auth/context";
import { applyMigrations, createCompany } from "@/lib/data/db-setup";
import { DEMO_COMPANY_ID } from "@/lib/data/seed";
import type { SqlClient, SqlDatabase } from "@/lib/data/sql";
import { findUserProfile, upsertWorkspaceUser } from "@/lib/data/users";

const ACME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ASHA = "33333333-3333-4333-8333-333333333333";
const TOKEN = "automation-secret-token";

const SUPABASE: AuthEnv = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", AERA_DATA_ADAPTER: "postgres" };

const profile = (role: UserProfile["role"]): UserProfile => ({ id: ASHA, companyId: ACME, role, name: "Asha Rao", email: "asha@acme.example" });

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
    expect(() => resolveAuthMode({ AERA_AUTH_MODE: "dev", AERA_DATA_ADAPTER: "postgres", NODE_ENV: "production" })).toThrow(/cannot be used with a database in production/);
    expect(resolveAuthMode({ AERA_AUTH_MODE: "dev", AERA_DATA_ADAPTER: "postgres", NODE_ENV: "development" })).toBe("dev");
  });

  it("refuses Supabase Auth without keys or without the postgres adapter", () => {
    expect(() => resolveAuthMode({ AERA_AUTH_MODE: "supabase", AERA_DATA_ADAPTER: "postgres" })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => resolveAuthMode({ ...SUPABASE, AERA_DATA_ADAPTER: "mock" })).toThrow(/AERA_DATA_ADAPTER=postgres/);
    expect(() => resolveAuthMode({ AERA_AUTH_MODE: "none" })).toThrow(/Unknown AERA_AUTH_MODE/);
  });
});

describe("Supabase session context", () => {
  it("takes company, user and role from the public.users row", async () => {
    expect(await resolveRequestContext(source(), SUPABASE)).toEqual({ companyId: ACME, userId: ASHA, role: "finance_manager", name: "Asha Rao", email: "asha@acme.example", mode: "supabase" });
  });

  it("answers 401 without a session", async () => {
    expect((await authError(resolveRequestContext(source({ sessionUser: async () => null }), SUPABASE))).status).toBe(401);
  });

  it("answers 403 for a signed-in user who is not provisioned in any company", async () => {
    expect((await authError(resolveRequestContext(source({ findProfile: async () => null }), SUPABASE))).status).toBe(403);
  });

  it("ignores spoofed company and bearer headers on ordinary routes", async () => {
    const spoofed = source({ companyHeader: OTHER, authorization: `Bearer ${TOKEN}` });
    const context = await resolveRequestContext(spoofed, { ...SUPABASE, AERA_INTERNAL_API_TOKEN: TOKEN, AERA_AUTOMATION_COMPANY_ID: OTHER });
    expect(context).toMatchObject({ companyId: ACME, userId: ASHA, role: "finance_manager" });
  });

  it("does not let headers stand in for a missing session", async () => {
    const anonymous = source({ sessionUser: async () => null, companyHeader: ACME });
    expect((await authError(resolveRequestContext(anonymous, SUPABASE))).status).toBe(401);
  });
});

describe("n8n automation token", () => {
  const env: AuthEnv = { ...SUPABASE, AERA_INTERNAL_API_TOKEN: TOKEN, AERA_AUTOMATION_COMPANY_ID: ACME };
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

  it("needs AERA_AUTOMATION_COMPANY_ID in Supabase mode", async () => {
    await expect(resolveRequestContext(n8n(`Bearer ${TOKEN}`), { ...SUPABASE, AERA_INTERNAL_API_TOKEN: TOKEN })).rejects.toThrow(/AERA_AUTOMATION_COMPANY_ID/);
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
    expect(await resolveRequestContext(source(), { AERA_DEV_COMPANY_ID: ACME, AERA_DEV_ROLE: "viewer" })).toMatchObject({ companyId: ACME, role: "viewer" });
    await expect(resolveRequestContext(source(), { AERA_DEV_ROLE: "owner" })).rejects.toThrow(/AERA_DEV_ROLE/);
  });

  it("requires the token on automation routes once one is configured", async () => {
    const env: AuthEnv = { AERA_INTERNAL_API_TOKEN: TOKEN };
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
      expect(await findUserProfile(db, "user-demo-manager")).toBeNull();
    } finally {
      await pg.close();
    }
  }, 60_000);
});

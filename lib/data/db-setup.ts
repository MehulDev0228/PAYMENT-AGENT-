import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { defaultPolicy } from "@/lib/domain/policy";
import type { Company, DataSet } from "@/lib/domain/types";
import { writeDataSet } from "./postgres-repository";
import { createSeedData } from "./seed";
import type { SqlClient, SqlDatabase } from "./sql";

export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

/**
 * Plain PostgreSQL (local Docker, CI, embedded tests) has no Supabase `auth` schema.
 * Creates the two objects the migrations reference; a no-op on Supabase.
 */
export async function ensureAuthShim(db: SqlClient) {
  const [row] = await db.query<{ present: boolean }>("select exists(select 1 from pg_namespace where nspname = 'auth') as present");
  if (row.present) return;
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  `);
}

/** Applies supabase/migrations/*.sql in order, once each, recording them in public.aera_schema_migrations. */
export async function applyMigrations(db: SqlDatabase, dir = MIGRATIONS_DIR): Promise<string[]> {
  await ensureAuthShim(db);
  const [tracker] = await db.query<{ present: boolean }>("select to_regclass('public.aera_schema_migrations') is not null as present");
  if (!tracker.present) {
    await db.exec("create table public.aera_schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    // A database where 001 was pasted into the Supabase SQL editor already has the base schema.
    const [base] = await db.query<{ present: boolean }>("select to_regclass('public.companies') is not null as present");
    if (base.present) await db.query("insert into public.aera_schema_migrations (name) values ('001_initial.sql')");
  }
  const applied = new Set((await db.query<{ name: string }>("select name from public.aera_schema_migrations")).map((row) => row.name));
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  const ran: string[] = [];
  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = await readFile(path.join(dir, name), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("insert into public.aera_schema_migrations (name) values ($1)", [name]);
    });
    ran.push(name);
  }
  return ran;
}

/** Creates a company with the default collection policy ladder. Returns the new company id. */
export async function createCompany(db: SqlDatabase, input: { id?: string; name: string; currency?: string; timezone?: string }): Promise<string> {
  const id = input.id ?? randomUUID();
  await db.transaction(async (tx) => {
    await tx.query("insert into public.companies (id, name, currency, timezone) values ($1, $2, $3, $4)", [id, input.name, input.currency ?? "INR", input.timezone ?? "Asia/Kolkata"]);
    const [policy] = await tx.query<{ id: string }>("insert into public.collection_policies (company_id, name) values ($1, 'Default collection policy') returning id", [id]);
    for (const step of defaultPolicy(id).steps) {
      await tx.query(
        `insert into public.collection_policy_steps (company_id, policy_id, step_key, days_overdue, action, tone, requires_human_approval, escalation_level)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, policy.id, step.id, step.daysOverdue, step.action, step.tone, step.requiresHumanApproval, step.escalationLevel ?? null],
      );
    }
  });
  return id;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Maps the synthetic seed's readable ids ("inv-0042") to stable uuids so it fits the uuid schema. */
function seedUuid(value: string): string {
  if (UUID.test(value)) return value;
  const hex = createHash("md5").update(`aera-seed:${value}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const ID_FIELDS = ["id", "customerId", "invoiceId", "collectionCaseId", "sourceMessageId", "entityId"];

function withUuids<T extends object>(item: T): T {
  const copy = { ...item } as Record<string, unknown>;
  for (const field of ID_FIELDS) if (typeof copy[field] === "string") copy[field] = seedUuid(copy[field] as string);
  return copy as unknown as T;
}

/** Loads the deterministic demo dataset (200 customers, 1,000 invoices, …) into an empty database. */
export async function seedDemo(db: SqlDatabase): Promise<string> {
  const seed = createSeedData();
  const company: Company = seed.companies[0];
  const [existing] = await db.query<{ present: boolean }>("select exists(select 1 from public.companies where id = $1) as present", [company.id]);
  if (existing.present) throw new Error(`Demo company ${company.id} already exists; drop it before seeding again`);
  await createCompany(db, { id: company.id, name: company.name, currency: company.currency, timezone: company.timezone });
  const data: DataSet = {
    ...seed,
    customers: seed.customers.map(withUuids),
    invoices: seed.invoices.map(withUuids),
    payments: seed.payments.map(withUuids),
    cases: seed.cases.map(withUuids),
    actions: seed.actions.map(withUuids),
    promises: seed.promises.map(withUuids),
    communications: seed.communications.map(withUuids),
    auditEvents: seed.auditEvents.map(withUuids),
  };
  await db.transaction((tx) => writeDataSet(tx, data));
  return company.id;
}

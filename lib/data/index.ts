import { sharedMockRepository } from "./mock-repository";
import { createPostgresRepository } from "./postgres-repository";
import type { KindlyPayRepository } from "./repository";
import { createPgDatabase, type SqlDatabase } from "./sql";

// One connection pool per process, kept across dev-server hot reloads.
declare global { var __kindlypayDatabase: SqlDatabase | undefined; }

// KINDLYPAY_DATA_ADAPTER=postgres persists to PostgreSQL/Supabase via DATABASE_URL.
// The default mock adapter runs on deterministic synthetic data and needs no services.
function selectRepository(): KindlyPayRepository {
  const adapter = process.env.KINDLYPAY_DATA_ADAPTER || "mock";
  if (adapter === "mock") return sharedMockRepository();
  if (adapter === "postgres" || adapter === "supabase") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error(`KINDLYPAY_DATA_ADAPTER=${adapter} requires DATABASE_URL`);
    globalThis.__kindlypayDatabase ??= createPgDatabase(url);
    return createPostgresRepository(globalThis.__kindlypayDatabase);
  }
  throw new Error(`Unknown KINDLYPAY_DATA_ADAPTER "${adapter}" (expected mock or postgres)`);
}

export const repository: KindlyPayRepository = selectRepository();

/** The PostgreSQL connection behind the postgres adapter (undefined on the mock adapter). */
export function sqlDatabase(): SqlDatabase | undefined {
  return globalThis.__kindlypayDatabase;
}

let demo: KindlyPayRepository | undefined;

/** Fictional demo data for public pages, so they never read a tenant's database. */
export function demoRepository(): KindlyPayRepository {
  if ((process.env.KINDLYPAY_DATA_ADAPTER || "mock") === "mock") return repository;
  return (demo ??= sharedMockRepository());
}

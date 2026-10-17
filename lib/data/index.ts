import { sharedMockRepository } from "./mock-repository";
import { createPostgresRepository } from "./postgres-repository";
import type { AeraRepository } from "./repository";
import { createPgDatabase, type SqlDatabase } from "./sql";

// One connection pool per process, kept across dev-server hot reloads.
declare global { var __aeraDatabase: SqlDatabase | undefined; }

// AERA_DATA_ADAPTER=postgres persists to PostgreSQL/Supabase via DATABASE_URL.
// The default mock adapter runs on deterministic synthetic data and needs no services.
function selectRepository(): AeraRepository {
  const adapter = process.env.AERA_DATA_ADAPTER || "mock";
  if (adapter === "mock") return sharedMockRepository();
  if (adapter === "postgres" || adapter === "supabase") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error(`AERA_DATA_ADAPTER=${adapter} requires DATABASE_URL`);
    globalThis.__aeraDatabase ??= createPgDatabase(url);
    return createPostgresRepository(globalThis.__aeraDatabase);
  }
  throw new Error(`Unknown AERA_DATA_ADAPTER "${adapter}" (expected mock or postgres)`);
}

export const repository: AeraRepository = selectRepository();

/** The PostgreSQL connection behind the postgres adapter (undefined on the mock adapter). */
export function sqlDatabase(): SqlDatabase | undefined {
  return globalThis.__aeraDatabase;
}

let demo: AeraRepository | undefined;

/** Fictional demo data for public pages, so they never read a tenant's database. */
export function demoRepository(): AeraRepository {
  if ((process.env.AERA_DATA_ADAPTER || "mock") === "mock") return repository;
  return (demo ??= sharedMockRepository());
}

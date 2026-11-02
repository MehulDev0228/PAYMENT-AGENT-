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

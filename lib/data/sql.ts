import { Pool } from "pg";

/** The small slice of a Postgres driver the adapter needs, so tests can swap in an embedded database. */
export interface SqlClient {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<R[]>;
  /** Runs a multi-statement script without parameters (migrations). */
  exec(text: string): Promise<void>;
}

export interface SqlDatabase extends SqlClient {
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
}

/**
 * node-postgres pool. Works with a direct Supabase connection or its transaction pooler (port 6543).
 * TLS is configured by the connection string (sslmode / sslrootcert), see README.
 */
export function createPgDatabase(connectionString: string): SqlDatabase & { end(): Promise<void> } {
  const pool = new Pool({ connectionString, max: Number(process.env.AERA_DB_POOL_SIZE || 5) });
  return {
    async query(text, params) {
      return (await pool.query(text, params)).rows;
    },
    async exec(text) {
      await pool.query(text);
    },
    end: () => pool.end(),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn({
          query: async (text, params) => (await client.query(text, params)).rows,
          exec: async (text) => { await client.query(text); },
        });
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

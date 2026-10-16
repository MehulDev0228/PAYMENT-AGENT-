/**
 * Database tasks for the PostgreSQL / Supabase adapter. Reads DATABASE_URL (from .env.local when present).
 *
 *   npm run db:migrate                                  apply supabase/migrations/*.sql
 *   npm run db:create-company -- "Acme Pvt Ltd" [--currency INR] [--timezone Asia/Kolkata]
 *   npm run db:seed-demo                                load the synthetic demo dataset
 */
import { applyMigrations, createCompany, seedDemo } from "@/lib/data/db-setup";
import { createPgDatabase } from "@/lib/data/sql";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (add it to .env.local)");
  const db = createPgDatabase(url);
  try {
    if (command === "migrate") {
      const ran = await applyMigrations(db);
      console.log(ran.length ? `Applied ${ran.join(", ")}` : "Schema is up to date");
    } else if (command === "create-company") {
      const name = args.find((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));
      if (!name) throw new Error('Usage: npm run db:create-company -- "Company name" [--currency INR] [--timezone Asia/Kolkata]');
      const id = await createCompany(db, { name, currency: option(args, "currency"), timezone: option(args, "timezone") });
      console.log(`Created company ${id}. Set AERA_DEV_COMPANY_ID=${id} until authentication is enabled.`);
    } else if (command === "seed-demo") {
      const id = await seedDemo(db);
      console.log(`Seeded demo company ${id}`);
    } else {
      throw new Error("Unknown command. Use migrate, create-company or seed-demo.");
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

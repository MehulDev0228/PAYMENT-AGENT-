/**
 * Database tasks for the PostgreSQL / Supabase adapter. Reads DATABASE_URL (from .env.local when present).
 *
 *   npm run db:migrate                                  apply supabase/migrations/*.sql
 *   npm run db:create-company -- "Acme Pvt Ltd" [--currency INR] [--timezone Asia/Kolkata]
 *   npm run db:seed-demo                                load the synthetic demo dataset
 *   npm run db:add-user -- person@company.com --company <id> --role finance_manager --name "Asha Rao" [--password <pw>] [--regions North,West|all]
 *                                                       give a Supabase Auth user access to a company (optionally to some regions only)
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { isUserRole } from "@/lib/auth/context";
import { applyMigrations, createCompany, seedDemo } from "@/lib/data/db-setup";
import { createPgDatabase, type SqlDatabase } from "@/lib/data/sql";
import { upsertWorkspaceUser } from "@/lib/data/users";
import { parseRegions } from "@/lib/domain/regions";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

/** Finds the Supabase Auth user for an email, creating it (email confirmed) when it does not exist yet. */
async function authUserId(db: SqlDatabase, email: string, password?: string): Promise<{ id: string; password?: string }> {
  const [existing] = await db.query<{ id: string }>("select id::text as id from auth.users where lower(email) = lower($1)", [email]);
  if (existing) return { id: existing.id };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Creating a sign-in needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or create the user in the Supabase dashboard first)");
  const initial = password ?? randomBytes(12).toString("base64url");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.createUser({ email, password: initial, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create the sign-in: ${error?.message ?? "unknown error"}`);
  return { id: data.user.id, password: password ? undefined : initial };
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
      console.log(`Created company ${id}. Add its first admin with: npm run db:add-user -- you@company.com --company ${id} --role admin --name "Your Name"`);
    } else if (command === "seed-demo") {
      const id = await seedDemo(db);
      console.log(`Seeded demo company ${id}`);
    } else if (command === "add-user") {
      const email = args.find((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));
      const companyId = option(args, "company");
      const role = option(args, "role") ?? "viewer";
      if (!email || !companyId) throw new Error('Usage: npm run db:add-user -- person@company.com --company <id> [--role viewer|collection_manager|finance_manager|admin] [--name "Full name"] [--password <pw>] [--regions North,West|all]');
      if (!isUserRole(role)) throw new Error(`Unknown role "${role}"`);
      // Omitted: a new user gets every region and an existing user keeps theirs. "all" lifts a restriction.
      const regionsOption = option(args, "regions");
      const regions = regionsOption === undefined ? undefined : parseRegions(regionsOption);
      const auth = await authUserId(db, email, option(args, "password"));
      const user = await upsertWorkspaceUser(db, { id: auth.id, companyId, role, email, name: option(args, "name") ?? email.split("@")[0]!, regions });
      console.log(`${user.email} is now ${user.role} of company ${user.companyId}, ${user.regions ? `limited to ${user.regions.join(", ")}` : "with every region"}.`);
      if (auth.password) console.log(`Initial password (share it privately; it is not shown again): ${auth.password}`);
    } else {
      throw new Error("Unknown command. Use migrate, create-company, seed-demo or add-user.");
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

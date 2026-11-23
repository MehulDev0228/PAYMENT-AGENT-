import type { UserProfile } from "@/lib/auth/context";
import type { UserRole } from "@/lib/domain/types";
import type { SqlClient } from "./sql";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UserRow { id: string; company_id: string; company_name: string; role: UserRole; name: string; email: string; regions: string[] | null }

const toProfile = (row: UserRow): UserProfile => ({ id: row.id, companyId: row.company_id, companyName: row.company_name, role: row.role, name: row.name, email: row.email, regions: row.regions ?? null });

/** The workspace profile of a Supabase Auth user (public.users.id = auth.users.id). */
export async function findUserProfile(db: SqlClient, userId: string): Promise<UserProfile | null> {
  if (!UUID.test(userId)) return null;
  const [row] = await db.query<UserRow>(
    `select u.id, u.company_id, c.name as company_name, u.role::text as role, u.name, u.email, u.regions
       from public.users u join public.companies c on c.id = u.company_id where u.id = $1`, [userId]);
  return row ? toProfile(row) : null;
}

/**
 * Grants an existing auth user access to a company, or changes their role.
 * `regions`: a list limits the user to those regions, null opens every region, undefined keeps
 * an existing user's regions (every region for a new user), so a role change never widens access.
 */
export async function upsertWorkspaceUser(db: SqlClient, input: { id: string; companyId: string; name: string; email: string; role: UserRole; regions?: string[] | null }): Promise<UserProfile> {
  await db.query(
    `insert into public.users (id, company_id, name, email, role, regions) values ($1, $2, $3, $4, $5::public.user_role, $6::text[])
     on conflict (id) do update set company_id = excluded.company_id, name = excluded.name, email = excluded.email, role = excluded.role,
       regions = case when $7 then excluded.regions else public.users.regions end`,
    [input.id, input.companyId, input.name, input.email.toLowerCase(), input.role, input.regions ?? null, input.regions !== undefined],
  );
  return (await findUserProfile(db, input.id))!;
}

/**
 * Adds a brand-new user to a company. Unlike upsertWorkspaceUser it never touches an existing row,
 * so self sign-up can never move someone who already has a workspace into another company.
 * Returns false when the user already belongs to a company.
 */
export async function insertWorkspaceUser(db: SqlClient, input: { id: string; companyId: string; name: string; email: string; role: UserRole }): Promise<boolean> {
  const rows = await db.query(
    `insert into public.users (id, company_id, name, email, role) values ($1, $2, $3, $4, $5::public.user_role)
     on conflict do nothing returning id`,
    [input.id, input.companyId, input.name, input.email.toLowerCase(), input.role],
  );
  return rows.length === 1;
}

/** Display names for actor ids recorded on approvals and audit events. */
export async function userNames(db: SqlClient, companyId: string): Promise<Map<string, string>> {
  const rows = await db.query<{ id: string; name: string }>("select id::text as id, name from public.users where company_id = $1", [companyId]);
  return new Map(rows.map((row) => [row.id, row.name]));
}

import { randomUUID } from "node:crypto";
import type { NewCompany } from "@/lib/data/repository";
import type { SqlClient } from "@/lib/data/sql";
import { findUserProfile, insertWorkspaceUser } from "@/lib/data/users";

export interface NewWorkspace { userId: string; email: string; name: string; companyName: string }

/**
 * Self sign-up: gives a freshly registered Supabase Auth user their own empty company, as its admin.
 * A user who already belongs to a company is left untouched ("exists"), so signing up again can never
 * move an account into another company or change its role.
 */
export async function createWorkspaceForUser(db: SqlClient, createCompany: (input: NewCompany) => Promise<void>, input: NewWorkspace): Promise<"created" | "exists"> {
  if (await findUserProfile(db, input.userId)) return "exists";
  const companyId = randomUUID();
  await createCompany({ id: companyId, name: input.companyName.trim() });
  const added = await insertWorkspaceUser(db, { id: input.userId, companyId, name: input.name.trim(), email: input.email, role: "admin" });
  return added ? "created" : "exists";
}

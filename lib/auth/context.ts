import { createHash, timingSafeEqual } from "node:crypto";
import { DEMO_COMPANY_ID } from "@/lib/data/seed";
import type { UserRole } from "@/lib/domain/types";

/**
 * How AERA identifies the caller.
 *  - supabase: a Supabase Auth session; company and role come from the caller's public.users row.
 *  - dev:      no authentication. Every request acts as a demo manager. Local development only.
 */
export type AuthMode = "supabase" | "dev";

/** "automation" is the n8n service caller, authenticated by AERA_INTERNAL_API_TOKEN. */
export type ContextRole = UserRole | "automation";

export interface RequestContext {
  companyId: string;
  userId: string;
  role: ContextRole;
  name: string;
  email?: string;
  mode: AuthMode;
}

export type AuthEnv = Partial<Record<
  | "AERA_AUTH_MODE" | "AERA_DATA_ADAPTER" | "NODE_ENV" | "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "AERA_DEV_COMPANY_ID" | "AERA_DEV_ROLE" | "AERA_INTERNAL_API_TOKEN" | "AERA_AUTOMATION_COMPANY_ID",
  string
>>;

/** 401: no or invalid credentials. 403: authenticated, but not allowed. */
export class AuthError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

const USER_ROLES = new Set<UserRole>(["admin", "finance_manager", "collection_manager", "viewer"]);
const MANAGER_ROLES = new Set<ContextRole>(["admin", "finance_manager", "collection_manager", "automation"]);

export const ROLE_LABELS: Record<ContextRole, string> = {
  admin: "Admin", finance_manager: "Finance manager", collection_manager: "Collection manager", viewer: "Viewer (read-only)", automation: "Automation",
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.has(value as UserRole);
}

/**
 * Picks the auth mode and refuses unsafe combinations. With nothing configured, local `npm run dev`
 * runs in dev mode on the mock adapter. Setting NEXT_PUBLIC_SUPABASE_URL switches to Supabase Auth.
 */
export function resolveAuthMode(env: AuthEnv): AuthMode {
  const requested = env.AERA_AUTH_MODE || (env.NEXT_PUBLIC_SUPABASE_URL ? "supabase" : "dev");
  const adapter = env.AERA_DATA_ADAPTER || "mock";
  if (requested === "dev") {
    // Without authentication anyone can read and change the data. Allowed for the fictional in-memory
    // dataset, or for a real database only on a developer machine.
    if (adapter !== "mock" && env.NODE_ENV === "production") {
      throw new Error("AERA_AUTH_MODE=dev turns authentication off and cannot be used with a database in production. Configure Supabase Auth (see README).");
    }
    return "dev";
  }
  if (requested === "supabase") {
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("Supabase Auth needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
    if (adapter === "mock") throw new Error("Supabase Auth needs AERA_DATA_ADAPTER=postgres: workspace users live in public.users");
    return "supabase";
  }
  throw new Error(`Unknown AERA_AUTH_MODE "${requested}" (expected supabase or dev)`);
}

/** A verified Supabase Auth user (from the session JWT, never from request headers). */
export interface SessionUser { id: string; email?: string }

/** The caller's row in public.users. */
export interface UserProfile { id: string; companyId: string; role: UserRole; name: string; email: string }

export interface ContextSource {
  /** The Authorization header, only consulted on routes that accept the automation token. */
  authorization?: string | null;
  /** x-company-id sent by n8n. Never selects a company; a mismatch with the token's company is rejected. */
  companyHeader?: string | null;
  /** True for the n8n endpoints: /api/automation/*, the action queue and the execution callback. */
  acceptsAutomation?: boolean;
  sessionUser: () => Promise<SessionUser | null>;
  findProfile: (userId: string) => Promise<UserProfile | null>;
}

export function devContext(env: AuthEnv): RequestContext {
  const role = env.AERA_DEV_ROLE || "finance_manager";
  if (!isUserRole(role)) throw new Error(`Unknown AERA_DEV_ROLE "${role}"`);
  return { companyId: env.AERA_DEV_COMPANY_ID || DEMO_COMPANY_ID, userId: "user-demo-manager", role, name: "Mehul Patel", email: "mehul@aera.example", mode: "dev" };
}

function sameSecret(actual: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(actual), digest(expected));
}

function automationContext(source: ContextSource, env: AuthEnv, mode: AuthMode): RequestContext {
  const expected = env.AERA_INTERNAL_API_TOKEN;
  const token = source.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!expected) throw new AuthError(401, "Automation token is not configured (AERA_INTERNAL_API_TOKEN)");
  if (!token || !sameSecret(token, expected)) throw new AuthError(401, "Unauthorized automation request");
  // The token is bound to one company by configuration, so a caller cannot pick a tenant with a header.
  const companyId = env.AERA_AUTOMATION_COMPANY_ID || (mode === "dev" ? devContext(env).companyId : undefined);
  if (!companyId) throw new Error("AERA_AUTOMATION_COMPANY_ID must be set to the company n8n works for");
  if (source.companyHeader && source.companyHeader !== companyId) throw new AuthError(403, "x-company-id does not match the company this automation token is issued for");
  return { companyId, userId: "automation:n8n", role: "automation", name: "n8n automation", mode };
}

/**
 * Derives who is calling. Identity comes only from the verified session plus public.users, or from the
 * automation token on the n8n endpoints. x-user-id / x-user-role / x-company-id headers are never trusted.
 */
export async function resolveRequestContext(source: ContextSource, env: AuthEnv): Promise<RequestContext> {
  const mode = resolveAuthMode(env);
  const bearer = /^Bearer\s/i.test(source.authorization ?? "");
  if (source.acceptsAutomation && (bearer || (mode === "dev" && env.AERA_INTERNAL_API_TOKEN))) {
    return automationContext(source, env, mode);
  }
  if (mode === "dev") return devContext(env);

  const user = await source.sessionUser();
  if (!user) throw new AuthError(401, "Sign in to continue");
  const profile = await source.findProfile(user.id);
  if (!profile) throw new AuthError(403, "This account has no access to an AERA workspace. Ask an admin to add you.");
  if (!isUserRole(profile.role)) throw new AuthError(403, "Unknown workspace role");
  return { companyId: profile.companyId, userId: profile.id, role: profile.role, name: profile.name, email: profile.email, mode };
}

export function canManage(context: Pick<RequestContext, "role">): boolean {
  return MANAGER_ROLES.has(context.role);
}

/** Mutations (approvals, imports, payment matches, automation jobs) need a manager role. Viewers are read-only. */
export function requireManager(context: Pick<RequestContext, "role">): void {
  if (!canManage(context)) throw new AuthError(403, "Your role is read-only. A manager has to do this.");
}


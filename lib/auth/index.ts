import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { sqlDatabase } from "@/lib/data";
import { findUserProfile } from "@/lib/data/users";
import { AuthError, resolveAuthMode, resolveRequestContext, type AuthEnv, type AuthMode, type RequestContext, type UserProfile } from "./context";
import { verifiedSessionUser } from "./supabase";

export { AuthError, ROLE_LABELS, canManage, requireManager, type RequestContext } from "./context";

const env = () => process.env as AuthEnv;

export function authMode(): AuthMode {
  return resolveAuthMode(env());
}

async function findProfile(userId: string): Promise<UserProfile | null> {
  const db = sqlDatabase();
  return db ? findUserProfile(db, userId) : null;
}

/** The caller of a server component or server action. Throws AuthError when signed out or not provisioned. */
export const getRequestContext = cache(async (): Promise<RequestContext> => resolveRequestContext({ sessionUser: verifiedSessionUser, findProfile }, env()));

/** For workspace pages: like getRequestContext, but sends signed-out or unprovisioned users to /login. */
export async function getPageContext(): Promise<RequestContext> {
  try {
    return await getRequestContext();
  } catch (error) {
    if (error instanceof AuthError) redirect(error.status === 401 ? "/login" : "/login?error=no_access");
    throw error;
  }
}

/**
 * The caller of an API route. `automation: true` marks the n8n endpoints, which also accept
 * `Authorization: Bearer $AERA_INTERNAL_API_TOKEN` for the company in AERA_AUTOMATION_COMPANY_ID.
 */
export async function getApiContext(request: Request, options: { automation?: boolean } = {}): Promise<RequestContext> {
  return resolveRequestContext({
    authorization: request.headers.get("authorization"),
    companyHeader: request.headers.get("x-company-id"),
    acceptsAutomation: options.automation,
    sessionUser: verifiedSessionUser,
    findProfile,
  }, env());
}

/** JSON error response: 401/403 for auth failures, `status` for everything else. */
export function apiError(error: unknown, fallback: string, status = 400): NextResponse {
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}

import { cookies } from "next/headers";
import { SESSION_COOKIE, readSession, sessionFromCookieHeader, type Role, type Session } from "@/lib/session";

export interface RequestContext {
  companyId: string;
  userId: string;
  role: Role;
}

export class UnauthorizedError extends Error {
  constructor() { super("Sign in to continue"); }
}

const fromSession = (session: Session): RequestContext => ({ companyId: session.companyId, userId: session.userId, role: session.role });

/**
 * Context for an API route. A browser call is identified by its session cookie. A service call
 * (n8n) has already been checked against KINDLYPAY_INTERNAL_API_TOKEN by proxy.ts, and names its
 * company in x-company-id; proxy.ts strips that header from every other request.
 */
export function getRequestContext(request: Request): RequestContext {
  const session = sessionFromCookieHeader(request.headers.get("cookie"));
  if (session) return fromSession(session);
  const serviceCompany = request.headers.get("x-kindlypay-service") === "1" ? request.headers.get("x-company-id") : null;
  if (serviceCompany) return { companyId: serviceCompany, userId: "automation", role: "collection_manager" };
  throw new UnauthorizedError();
}

/** The signed-in person, for pages, layouts and server actions. */
export async function getSession(): Promise<Session> {
  const session = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) throw new UnauthorizedError();
  return session;
}

export async function getSessionContext(): Promise<RequestContext> {
  return fromSession(await getSession());
}

export function requireManager(context: RequestContext): void {
  if (!new Set(["admin", "finance_manager", "collection_manager"]).has(context.role)) {
    throw new Error("Insufficient permission");
  }
}

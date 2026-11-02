import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Sessions are a signed, httpOnly cookie: the payload is readable by the server only through
 * `readSession`, and any change to it breaks the HMAC. Nothing session-related is stored server-side.
 */
export const SESSION_COOKIE = "kp_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export type Role = "admin" | "finance_manager" | "collection_manager" | "viewer";

export interface Session {
  userId: string;
  companyId: string;
  companyName: string;
  name: string;
  email: string;
  role: Role;
  demo?: boolean;
  /** Expiry, seconds since epoch. */
  exp: number;
}

function secret(): string {
  const value = process.env.KINDLYPAY_SESSION_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") throw new Error("KINDLYPAY_SESSION_SECRET must be set to at least 32 characters in production");
  return "kindlypay-development-only-session-secret-change-me";
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function createSessionToken(session: Omit<Session, "exp">, maxAge = SESSION_MAX_AGE): string {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Math.floor(Date.now() / 1000) + maxAge })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSession(token: string | undefined | null): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    return session.exp > Date.now() / 1000 ? session : null;
  } catch {
    return null;
  }
}

/** Reads the session cookie out of a raw Cookie header. */
export function sessionFromCookieHeader(header: string | null): Session | null {
  const match = header?.split(/;\s*/).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return readSession(match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

// ------------------------------------------------------------------ passwords

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: SCRYPT.r, p: SCRYPT.p });
  return timingSafeEqual(expected, actual);
}

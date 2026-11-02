"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AccountError, signIn, signUp, type Account } from "@/lib/data/accounts";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";

export type AuthState = { error?: string; fields?: Record<string, string> };

// A few wrong passwords are normal; dozens in a row for one email are not. In-memory, per server process.
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 6;
const LOCKOUT_MS = 10 * 60 * 1000;

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

async function startSession(account: Account) {
  const { id, ...rest } = account;
  (await cookies()).set(SESSION_COOKIE, createSessionToken({ userId: id, ...rest }), sessionCookieOptions);
}

export async function signInAction(_state: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", fields: { email } };

  const lock = failures.get(email);
  if (lock && lock.count >= MAX_FAILURES && lock.until > Date.now()) return { error: "Too many attempts. Wait ten minutes and try again.", fields: { email } };

  try {
    await startSession(await signIn(email, password));
    failures.delete(email);
  } catch (error) {
    if (!(error instanceof AccountError)) throw error;
    const count = (lock && lock.until > Date.now() ? lock.count : 0) + 1;
    failures.set(email, { count, until: Date.now() + LOCKOUT_MS });
    return { error: error.message, fields: { email } };
  }
  redirect(safeNext(form.get("next")));
}

const SignUp = z.object({
  companyName: z.string().trim().min(2, "Enter your company's name."),
  name: z.string().trim().min(2, "Enter your name."),
  email: z.string().trim().email("Enter a valid work email."),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(200),
});

export async function signUpAction(_state: AuthState, form: FormData): Promise<AuthState> {
  const values = { companyName: String(form.get("companyName") ?? ""), name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") };
  const parsed = SignUp.safeParse(values);
  const fields = { companyName: values.companyName, name: values.name, email: values.email };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, fields };
  try {
    await startSession(await signUp(parsed.data));
  } catch (error) {
    if (error instanceof AccountError) return { error: error.message, fields };
    throw error;
  }
  redirect("/dashboard?welcome=1");
}

export async function signOutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

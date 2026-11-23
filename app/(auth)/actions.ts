"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authMode } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { createWorkspaceForUser } from "@/lib/auth/workspace";
import { repository, sqlDatabase } from "@/lib/data";

export type AuthState = { error?: string; notice?: string; fields?: Record<string, string> };

/** Only same-site paths, so the sign-in page cannot be used as an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

/** Supabase Auth rate-limits sign-in itself; these are the messages people see. */
function signInMessage(status: number | undefined, code: string | undefined): string {
  if (status === 429) return "Too many attempts. Wait a few minutes and try again.";
  if (code === "email_not_confirmed") return "Confirm your email first: open the link we sent you, then sign in.";
  if (!status || status >= 500) return "Sign-in is unreachable right now. Try again shortly.";
  // One message for unknown email and wrong password, so the form does not reveal which accounts exist.
  return "That email and password don't match.";
}

export async function signInAction(_state: AuthState, form: FormData): Promise<AuthState> {
  if (authMode() === "dev") redirect("/dashboard");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", fields: { email } };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: signInMessage(error.status, error.code), fields: { email } };
  redirect(safeNext(form.get("next")));
}

const SignUp = z.object({
  companyName: z.string().trim().min(2, "Enter your company's name."),
  name: z.string().trim().min(2, "Enter your name."),
  email: z.string().trim().toLowerCase().email("Enter a valid work email."),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(200),
});

const ALREADY_REGISTERED = "An account with this email already exists. Sign in instead.";

export async function signUpAction(_state: AuthState, form: FormData): Promise<AuthState> {
  if (authMode() === "dev") redirect("/dashboard");
  const values = { companyName: String(form.get("companyName") ?? ""), name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") };
  const fields = { companyName: values.companyName, name: values.name, email: values.email };
  const parsed = SignUp.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, fields };
  const db = sqlDatabase();
  if (!db) throw new Error("Sign-up needs KINDLYPAY_DATA_ADAPTER=postgres");

  const origin = (await headers()).get("origin") ?? process.env.KINDLYPAY_BASE_URL ?? "";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { name: parsed.data.name }, emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent("/dashboard?welcome=1")}` },
  });
  if (error) {
    if (error.status === 429) return { error: "Too many sign-ups from here. Wait a few minutes and try again.", fields };
    if (!error.status || error.status >= 500) return { error: "Sign-up is unreachable right now. Try again shortly.", fields };
    return { error: error.message, fields }; // e.g. a password Supabase's policy rejects
  }
  // Supabase answers a sign-up for a registered email with a user that has no identities, instead of an error.
  if (!data.user || data.user.identities?.length === 0) return { error: ALREADY_REGISTERED, fields };

  const outcome = await createWorkspaceForUser(db, repository.createCompany, { userId: data.user.id, email: parsed.data.email, name: parsed.data.name, companyName: parsed.data.companyName });
  if (outcome === "exists") return { error: ALREADY_REGISTERED, fields };
  // With email confirmation on (the Supabase default) there is no session until the link is opened.
  if (!data.session) return { notice: `Almost there. We sent a confirmation link to ${parsed.data.email}. Open it to finish setting up your workspace.`, fields };
  redirect("/dashboard?welcome=1");
}

export async function signOutAction() {
  if (authMode() === "supabase") await (await createSupabaseServerClient()).auth.signOut();
  redirect("/");
}

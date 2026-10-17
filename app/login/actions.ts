"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authMode } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/auth/supabase";

export type SignInState = { error?: string; email?: string };

const Credentials = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(200) });

/** Only same-site paths, so the login page cannot be used as an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

function signInMessage(status: number | undefined): string {
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  if (!status || status >= 500) return "The sign-in service is unreachable. Try again shortly.";
  // One message for unknown email and wrong password, so the form does not reveal which accounts exist.
  return "Email or password is incorrect.";
}

export async function signIn(_state: SignInState, formData: FormData): Promise<SignInState> {
  if (authMode() === "dev") redirect("/dashboard");
  const parsed = Credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const email = String(formData.get("email") || "");
  if (!parsed.success) return { error: "Enter your work email and password.", email };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: signInMessage(error.status), email };
  redirect(safeNext(formData.get("next")));
}

export async function signOut(): Promise<void> {
  if (authMode() === "supabase") await (await createSupabaseServerClient()).auth.signOut();
  redirect(authMode() === "supabase" ? "/login" : "/");
}

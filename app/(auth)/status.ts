import { redirect } from "next/navigation";
import { AuthError, authMode, getRequestContext } from "@/lib/auth";

/**
 * For /sign-in and /sign-up: sends anyone who already has a workspace (and everyone in dev mode) to it.
 * Returns "no_access" for a signed-in account without a workspace, so the page can say so instead of looping.
 */
export async function authPageStatus(): Promise<"signed_out" | "no_access"> {
  if (authMode() === "dev") redirect("/dashboard");
  const outcome = await getRequestContext().then(() => "ok" as const, (error) => (error instanceof AuthError && error.status === 403 ? "no_access" as const : "signed_out" as const));
  if (outcome === "ok") redirect("/dashboard");
  return outcome;
}

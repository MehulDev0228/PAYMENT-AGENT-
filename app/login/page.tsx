import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut, ShieldAlert } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/ui";
import { AuthError, authMode, getRequestContext } from "@/lib/auth";
import { signOut } from "./actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next } = await searchParams;
  if (authMode() === "dev") redirect("/dashboard");

  // Signed in with workspace access: nothing to do here. Signed in without access: say so.
  const outcome = await getRequestContext().then(() => "ok" as const, (error) => (error instanceof AuthError && error.status === 403 ? "no_access" as const : "signed_out" as const));
  if (outcome === "ok") redirect("/dashboard");

  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-ink px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center"><Logo href="/" /></div>
        <section className="panel p-6 md:p-8">
          {outcome === "no_access" ? (
            <>
              <span className="grid size-10 place-items-center rounded-xl bg-[#fdf7e6] text-warning"><ShieldAlert size={18} aria-hidden="true" /></span>
              <h1 className="mt-5 text-[22px] font-medium tracking-[-0.03em]">No workspace access yet</h1>
              <p className="mt-2 text-[13.5px] leading-6 text-muted">You are signed in, but this account is not a member of any AERA company. Ask an admin to add you, then sign in again.</p>
              <form action={signOut} className="mt-6"><button type="submit" className="btn-outline w-full"><LogOut size={15} aria-hidden="true" /> Sign out</button></form>
            </>
          ) : (
            <>
              <p className="eyebrow eyebrow-dot">Workspace</p>
              <h1 className="mb-6 mt-3 text-[24px] font-medium tracking-[-0.035em]">Sign in to AERA</h1>
              <LoginForm next={next} />
              <p className="mt-5 text-[12.5px] leading-5 text-muted">Accounts are created by your workspace admin. There is no self sign-up.</p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

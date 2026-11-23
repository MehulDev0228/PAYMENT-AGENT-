import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LogOut, ShieldAlert } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { signInAction, signOutAction } from "../actions";
import { authPageStatus } from "../status";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; demo?: string; error?: string }> }) {
  const { next, demo, error } = await searchParams;
  if (await authPageStatus() === "no_access") {
    return (
      <div className="animate-rise">
        <span className="grid size-11 place-items-center rounded-xl bg-[#fdf7e6] text-warning"><ShieldAlert size={20} aria-hidden="true" /></span>
        <h1 className="title mt-5">No workspace yet.</h1>
        <p className="mt-2 text-[14px] leading-6 text-muted">You&apos;re signed in, but this account isn&apos;t part of a KindlyPay company. Ask your admin to add you, or sign out and create your own workspace.</p>
        <form action={signOutAction} className="mt-8"><button type="submit" className="btn-outline min-h-11 w-full"><LogOut size={15} aria-hidden="true" /> Sign out</button></form>
      </div>
    );
  }
  return (
    <div className="animate-rise">
      <p className="eyebrow eyebrow-dot">Welcome back</p>
      <h1 className="title mt-3">Sign in to KindlyPay.</h1>
      <p className="mt-2 text-[14px] text-muted">New here? <Link href="/sign-up" className="font-medium text-ink underline-offset-2 hover:underline">Create a free account</Link></p>

      {error === "link_expired" && <p role="alert" className="mt-6 rounded-xl bg-[#fdf7e6] px-3.5 py-3 text-[13px] text-warning">That link has expired or was already used. Sign in, or sign up again to get a new one.</p>}
      <div className="mt-8">
        <AuthForm action={signInAction} submit="Sign in" pendingLabel="Signing in…" hidden={{ next: next ?? "/dashboard" }}
          fields={[{ name: "email", label: "Work email", type: "email", autoComplete: "email", placeholder: "you@company.com" }, { name: "password", label: "Password", type: "password", autoComplete: "current-password" }]} />
      </div>

      <div className="my-6 flex items-center gap-3 text-[12px] text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
      {/* A plain link, not prefetched: following it signs you into the demo. */}
      <a href="/api/auth/demo" className="btn-outline group min-h-11 w-full">Explore the live demo <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" /></a>
      <p className="mt-2 text-center text-[12px] text-muted">{demo === "unavailable" ? "The demo isn\u2019t set up on this server yet (see README: demo login)." : "Fictional companies and bills. Nothing to set up."}</p>
    </div>
  );
}

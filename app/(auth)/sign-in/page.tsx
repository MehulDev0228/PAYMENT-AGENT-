import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { signInAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; demo?: string }> }) {
  const { next, demo } = await searchParams;
  return (
    <div className="animate-rise">
      <p className="eyebrow eyebrow-dot">Welcome back</p>
      <h1 className="title mt-3">Sign in to KindlyPay.</h1>
      <p className="mt-2 text-[14px] text-muted">New here? <Link href="/sign-up" className="font-medium text-ink underline-offset-2 hover:underline">Create a free account</Link></p>

      <div className="mt-8">
        <AuthForm action={signInAction} submit="Sign in" pendingLabel="Signing in…" hidden={{ next: next ?? "/dashboard" }}
          fields={[{ name: "email", label: "Work email", type: "email", autoComplete: "email", placeholder: "you@company.com" }, { name: "password", label: "Password", type: "password", autoComplete: "current-password" }]} />
      </div>

      <div className="my-6 flex items-center gap-3 text-[12px] text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
      {/* A plain link, not prefetched: following it signs you into the demo. */}
      <a href="/api/auth/demo" className="btn-outline group min-h-11 w-full">Explore the live demo <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" /></a>
      <p className="mt-2 text-center text-[12px] text-muted">{demo === "unavailable" ? "The demo needs demo data in this database (npm run db:seed-demo)." : "Fictional companies and bills. Nothing to set up."}</p>
    </div>
  );
}

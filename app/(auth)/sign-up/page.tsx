import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { PLANS } from "@/components/marketing/plans";
import { signUpAction } from "../actions";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const chosen = PLANS.find((item) => item.key === plan) ?? PLANS[1];
  return (
    <div className="animate-rise">
      <p className="eyebrow eyebrow-dot">30-day free trial · no card needed</p>
      <h1 className="title mt-3">Start getting paid on time.</h1>
      <p className="mt-2 text-[14px] text-muted">Already have an account? <Link href="/sign-in" className="font-medium text-ink underline-offset-2 hover:underline">Sign in</Link></p>

      <div className="mt-6 flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3 text-[13px]">
        <span><span className="font-medium">{chosen.name} plan</span> <span className="text-muted">· {chosen.tagline}</span></span>
        <Link href="/#pricing" className="text-muted underline-offset-2 hover:text-ink hover:underline">Change</Link>
      </div>

      <div className="mt-6">
        <AuthForm action={signUpAction} submit="Create my account" pendingLabel="Setting up your workspace…"
          fields={[
            { name: "companyName", label: "Company name", autoComplete: "organization", placeholder: "CityBond Traders" },
            { name: "name", label: "Your name", autoComplete: "name", placeholder: "Your full name" },
            { name: "email", label: "Work email", type: "email", autoComplete: "email", placeholder: "you@company.com" },
            { name: "password", label: "Password", type: "password", autoComplete: "new-password", placeholder: "At least 8 characters" },
          ]} />
      </div>
      <p className="mt-4 text-[12px] leading-5 text-muted">You start with an empty, private workspace. Only your company can see what you upload, and you can delete it any time.</p>
    </div>
  );
}

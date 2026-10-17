"use client";

import { useActionState } from "react";
import { CircleAlert, LogIn } from "lucide-react";
import { signIn, type SignInState } from "@/app/login/actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="block">
        <span className="eyebrow">Work email</span>
        <input name="email" type="email" autoComplete="username" required defaultValue={state.email} className="input mt-1.5" />
      </label>
      <label className="block">
        <span className="eyebrow">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="input mt-1.5" />
      </label>
      {state.error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-[#fdecea] p-3 text-[13px] text-danger"><CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full"><LogIn size={15} aria-hidden="true" />{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import type { AuthState } from "@/app/(auth)/actions";
import { Spinner } from "./ui";

type Field = { name: string; label: string; type?: string; autoComplete: string; placeholder?: string };

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-primary min-h-11 w-full">{pending && <Spinner />}{pending ? pendingLabel : label}</button>;
}

function PasswordInput({ field, autoFocus }: { field: Field; autoFocus?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input id={field.name} name={field.name} type={visible ? "text" : "password"} autoComplete={field.autoComplete} required placeholder={field.placeholder} autoFocus={autoFocus} className="input min-h-11 pr-11" />
      <button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink">
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function AuthForm({ action, fields, submit, pendingLabel, hidden }: { action: (state: AuthState, form: FormData) => Promise<AuthState>; fields: Field[]; submit: string; pendingLabel: string; hidden?: Record<string, string> }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {Object.entries(hidden ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      {fields.map((field, index) => (
        <label key={field.name} htmlFor={field.name} className="block">
          <span className="mb-1.5 block text-[13px] font-medium">{field.label}</span>
          {field.type === "password"
            ? <PasswordInput field={field} autoFocus={index === 0} />
            : <input id={field.name} name={field.name} type={field.type ?? "text"} autoComplete={field.autoComplete} required placeholder={field.placeholder} defaultValue={state.fields?.[field.name]} autoFocus={index === 0} className="input min-h-11" />}
        </label>
      ))}
      {state.error && <p role="alert" className="animate-rise flex items-start gap-2 rounded-xl bg-[#fdecea] px-3.5 py-3 text-[13px] text-danger"><CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{state.error}</p>}
      <Submit label={submit} pendingLabel={pendingLabel} />
    </form>
  );
}

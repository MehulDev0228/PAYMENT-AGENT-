"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, UserRoundCheck } from "lucide-react";
import { CALL_OUTCOMES, CALL_OUTCOME_LABELS } from "@/lib/domain/collector";
import type { CallOutcome, WorkspaceUser } from "@/lib/domain/types";
import { ReadOnlyNote } from "./ui";

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Request failed");
}

/** Owner picker on a case. Managers change it; everyone sees who owns the case. */
export function CaseAssignment({ caseId, assignedTo, assigneeName, users, currentUserId, readOnly }: {
  caseId: string; assignedTo?: string; assigneeName?: string; users: WorkspaceUser[]; currentUserId: string; readOnly: boolean;
}) {
  const [value, setValue] = useState(assignedTo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function save(next: string) {
    setBusy(true); setError("");
    try {
      await post(`/api/collections/cases/${caseId}/assign`, { assigneeId: next || null });
      setValue(next);
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assignment failed");
    } finally {
      setBusy(false);
    }
  }

  const owner = assigneeName ?? (assignedTo ? "Unknown user" : "Unassigned");
  return (
    <article className="panel p-5">
      <p className="eyebrow flex items-center gap-2"><UserRoundCheck size={13} aria-hidden="true" /> Owner</p>
      <p className="mt-3 text-[17px] font-medium tracking-[-0.02em]">{owner}</p>
      {readOnly ? <div className="mt-2"><ReadOnlyNote>Read-only access. A manager assigns cases.</ReadOnlyNote></div> : (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="sr-only">Assign to</span>
            <select value={value} disabled={busy} onChange={(event) => save(event.target.value)} className="input">
              <option value="">Unassigned</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}{user.id === currentUserId ? " (me)" : ""}</option>)}
            </select>
          </label>
          {value !== currentUserId && users.some((user) => user.id === currentUserId) && (
            <button type="button" disabled={busy} onClick={() => save(currentUserId)} className="btn-ghost btn-sm -ml-2">Assign to me</button>
          )}
          {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
        </div>
      )}
    </article>
  );
}

/** Log a call: what happened, a note, and when to call again. */
export function FollowUpForm({ caseId, today, readOnly }: { caseId: string; today: string; readOnly: boolean }) {
  const [outcome, setOutcome] = useState<CallOutcome>("reached");
  const [note, setNote] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await post(`/api/collections/cases/${caseId}/follow-ups`, { outcome, note, nextFollowUpDate: next || undefined });
      setNote(""); setNext("");
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not log the follow-up");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel p-5">
      <p className="eyebrow flex items-center gap-2"><PhoneCall size={13} aria-hidden="true" /> Log a follow-up</p>
      {readOnly ? <div className="mt-3"><ReadOnlyNote>Read-only access. A manager logs calls and notes.</ReadOnlyNote></div> : (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <fieldset>
            <legend className="sr-only">Call outcome</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {CALL_OUTCOMES.map((item) => (
                <label key={item} className={`flex min-h-9 cursor-pointer items-center justify-center rounded-lg border px-2 text-center text-[12.5px] transition-colors ${outcome === item ? "border-ink bg-ink font-medium text-white" : "border-line text-muted hover:text-ink"}`}>
                  <input type="radio" name="outcome" value={item} checked={outcome === item} onChange={() => setOutcome(item)} className="sr-only" />
                  {CALL_OUTCOME_LABELS[item]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-muted">Note</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} placeholder="Who you spoke to, what they said" className="input min-h-20 py-2" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-muted">Next follow-up</span>
            <input type="date" value={next} min={today} onChange={(event) => setNext(event.target.value)} className="input" />
          </label>
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Saving…" : "Save follow-up"}</button>
          {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
        </form>
      )}
    </article>
  );
}

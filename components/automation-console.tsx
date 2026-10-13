"use client";

import { useState, useTransition } from "react";
import { CalendarCheck, CheckCircle2, CircleAlert, MailCheck, Play, Radar, Reply } from "lucide-react";
import type { JobResult } from "@/app/(workspace)/automation/actions";
import { checkPromises, dispatchRemindersLocally, runDailyMonitor, simulateReply } from "@/app/(workspace)/automation/actions";
import { cx } from "./ui";

const JOBS = [
  { key: "monitor", n: "01", title: "Daily collection monitor", body: "Evaluates every overdue invoice against the policy ladder and queues reminders or approvals. Idempotent per policy step.", schedule: "n8n · daily 09:00", icon: Radar, run: runDailyMonitor },
  { key: "dispatch", n: "02", title: "Reminder dispatch", body: "Drafts queued reminders from verified facts and logs them. Locally this is simulated: no email leaves the machine.", schedule: "n8n + Gmail · after monitor", icon: MailCheck, run: dispatchRemindersLocally },
  { key: "promises", n: "03", title: "Promise monitor", body: "Checks promises that have fallen due. Kept if a matched payment settled the invoice, otherwise missed and escalated.", schedule: "n8n · daily 18:00", icon: CalendarCheck, run: checkPromises },
] as const;

const SAMPLE_REPLIES = ["We will pay on Tuesday.", "Can we pay 50% now and the rest next month?", "This invoice amount is incorrect, please check.", "Payment has been transferred today."];

function ResultPanel({ result }: { result?: JobResult }) {
  if (!result) return null;
  return (
    <div role="status" className={cx("animate-rise mt-4 rounded-xl border p-4 text-[13px]", result.ok ? "border-[#cfe9db] bg-brand-soft" : "border-[#f3c7c1] bg-[#fdecea]")}>
      <p className={cx("flex items-center gap-2 font-medium", result.ok ? "text-success" : "text-danger")}>{result.ok ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}{result.title}</p>
      <ul className="mt-2 space-y-1 font-mono text-[11.5px] leading-5 text-ink/75">{result.lines.map((line, index) => <li key={index}>› {line}</li>)}</ul>
    </div>
  );
}

export function AutomationConsole({ replyCases }: { replyCases: Array<{ id: string; label: string }> }) {
  const [results, setResults] = useState<Record<string, JobResult>>({});
  const [running, setRunning] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState(SAMPLE_REPLIES[0]);

  function run(key: string, job: () => Promise<JobResult>) {
    setRunning(key);
    startTransition(async () => {
      const result = await job();
      setResults((current) => ({ ...current, [key]: result }));
      setRunning(undefined);
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {JOBS.map((job) => (
        <article key={job.key} className="panel flex flex-col p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-10 place-items-center rounded-xl bg-ink text-glow"><job.icon size={18} aria-hidden="true" /></span>
            <span className="font-mono text-[11px] text-muted">{job.n}</span>
          </div>
          <h2 className="mt-5 text-[17px] font-medium tracking-[-0.025em]">{job.title}</h2>
          <p className="mt-1.5 flex-1 text-[13.5px] leading-6 text-muted">{job.body}</p>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">{job.schedule}</span>
            <button type="button" disabled={pending} onClick={() => run(job.key, job.run)} className="btn-primary btn-sm"><Play size={13} aria-hidden="true" />{running === job.key ? "Running…" : "Run now"}</button>
          </div>
          <ResultPanel result={results[job.key]} />
        </article>
      ))}

      <article className="panel flex flex-col p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <span className="grid size-10 place-items-center rounded-xl bg-ink text-glow"><Reply size={18} aria-hidden="true" /></span>
          <span className="font-mono text-[11px] text-muted">04</span>
        </div>
        <h2 className="mt-5 text-[17px] font-medium tracking-[-0.025em]">Reply processing</h2>
        <p className="mt-1.5 text-[13.5px] leading-6 text-muted">Simulate an inbound customer email. The classifier describes it; deterministic rules decide what AERA may do.</p>
        <form className="mt-4 space-y-3" action={(formData) => run("reply", () => simulateReply(formData))}>
          <label className="block">
            <span className="eyebrow">Case</span>
            <select name="caseId" className="input mt-1.5" required>{replyCases.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          </label>
          <label className="block">
            <span className="eyebrow">Customer says</span>
            <textarea name="body" value={body} onChange={(event) => setBody(event.target.value)} rows={3} className="input mt-1.5 py-2.5 leading-6" required maxLength={2000} />
          </label>
          <div className="flex flex-wrap gap-1.5">{SAMPLE_REPLIES.map((sample) => <button key={sample} type="button" onClick={() => setBody(sample)} className={cx("rounded-full border px-3 py-1 text-[12px] transition-colors", body === sample ? "border-ink bg-ink text-white" : "border-line text-muted hover:border-line-strong hover:text-ink")}>{sample}</button>)}</div>
          <div className="flex justify-end border-t border-line pt-4"><button type="submit" disabled={pending} className="btn-primary btn-sm"><Play size={13} aria-hidden="true" />{running === "reply" ? "Processing…" : "Process reply"}</button></div>
        </form>
        <ResultPanel result={results.reply} />
      </article>
    </div>
  );
}

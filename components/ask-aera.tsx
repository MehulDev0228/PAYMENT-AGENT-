"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Database } from "lucide-react";
import type { QueryTable } from "@/lib/agent/query";
import { cx } from "./ui";

type Message = { role: "user" | "assistant"; text: string; tool?: string; table?: QueryTable; error?: boolean };

const PROMPTS = ["How much is currently overdue?", "Which customers have the highest exposure?", "Which payment promises were missed?", "What decisions are waiting for approval?", "Show the aging breakdown", "What is the status of INV-1042?"];

export function AskAera() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  async function ask(text: string) {
    if (text.trim().length < 3 || busy) return;
    setMessages((current) => [...current, { role: "user", text }]);
    setQuestion(""); setBusy(true);
    try {
      const response = await fetch("/api/agent/collection/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: text }) });
      const result = await response.json();
      setMessages((current) => [...current, response.ok ? { role: "assistant", text: result.answer, tool: result.tool, table: result.table } : { role: "assistant", text: result.error || "The query failed.", error: true }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", text: "Could not reach the query service.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); ask(question); }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="panel flex min-h-[620px] flex-col overflow-hidden">
        <div aria-live="polite" className="scrollbar flex-1 space-y-6 overflow-y-auto p-5 md:p-7">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center py-16 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-ink text-glow"><Bot size={22} aria-hidden="true" /></span>
              <h2 className="mt-5 text-[22px] font-medium tracking-[-0.035em]">Ask a factual question.<span className="block text-muted">Get an answer with its source.</span></h2>
              <p className="mt-3 max-w-md text-[13.5px] leading-6 text-muted">Every answer comes from a named, read-only query over your receivables. AERA does not guess numbers and makes no financial decisions here.</p>
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} className={cx("flex gap-3", message.role === "user" ? "justify-end" : "justify-start")}>
              {message.role === "assistant" && <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-ink text-glow"><Bot size={15} aria-hidden="true" /></span>}
              <div className={cx("max-w-[min(640px,85%)] text-[14px] leading-6", message.role === "user" ? "rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-white" : "min-w-0 flex-1")}>
                <p className={cx(message.error && "text-danger")}>{message.text}</p>
                {message.table && message.table.rows.length > 0 && (
                  <div className="scrollbar mt-3 overflow-x-auto rounded-xl border border-line">
                    <table className="table-base text-[13px]">
                      <thead><tr>{message.table.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
                      <tbody>{message.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className={cx("py-2.5", typeof cell === "number" || /^[₹\d]/.test(String(cell)) ? "tabular" : "")}>{cell}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                )}
                {message.tool && <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-canvas px-2 py-1 font-mono text-[10.5px] text-muted"><Database size={11} aria-hidden="true" /> source: {message.tool}()</p>}
              </div>
            </div>
          ))}
          {busy && <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-[10px] bg-ink text-glow"><Bot size={15} aria-hidden="true" /></span><span className="animate-pulse-dot font-mono text-[12px] text-muted">querying verified records…</span></div>}
          <div ref={endRef} />
        </div>
        <form onSubmit={submit} className="border-t border-line p-3 md:p-4">
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-canvas p-1.5 pl-4 transition-colors focus-within:border-ink">
            <label className="sr-only" htmlFor="aera-question">Question about receivables</label>
            <input id="aera-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} className="min-h-10 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#8a909c]" placeholder="How much is overdue by more than 30 days?" />
            <button disabled={busy || question.trim().length < 3} aria-label="Send question" className="grid size-10 place-items-center rounded-xl bg-ink text-white transition-opacity disabled:opacity-30"><ArrowUp size={18} /></button>
          </div>
        </form>
      </section>
      <aside className="space-y-4">
        <section className="panel p-5">
          <p className="eyebrow">Try asking</p>
          <div className="mt-4 space-y-1.5">
            {PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => ask(prompt)} disabled={busy} className="w-full rounded-xl border border-line px-3.5 py-2.5 text-left text-[13.5px] leading-5 transition-colors hover:border-ink hover:bg-canvas">{prompt}</button>)}
          </div>
        </section>
        <section className="rounded-2xl bg-lime p-5 text-lime-ink">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] opacity-70">Data boundary</p>
          <p className="mt-3 text-[14px] leading-6">Only the minimum query result reaches the answer layer. AERA never sends your whole ledger to a model.</p>
        </section>
      </aside>
    </div>
  );
}

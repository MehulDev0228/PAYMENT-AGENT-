"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getRequestContext, requireManager } from "@/lib/auth";
import { generateReminder } from "@/lib/ai/communication";
import { classifyCustomerReply } from "@/lib/ai/customer-reply";
import { repository } from "@/lib/data";

export type JobResult = { ok: true; title: string; lines: string[] } | { ok: false; title: string; lines: string[] };

function done(title: string, lines: string[]): JobResult {
  revalidatePath("/", "layout");
  return { ok: true, title, lines };
}

function failed(error: unknown): JobResult {
  return { ok: false, title: "Job failed", lines: [error instanceof Error ? error.message : "Unknown error"] };
}

export async function runDailyMonitor(): Promise<JobResult> {
  try {
    const context = getRequestContext(); requireManager(context);
    const result = await repository.runDailyMonitor(context.companyId);
    const approvals = result.actions.filter((action) => action.status === "awaiting_approval").length;
    return done("Daily monitor finished", [`Reviewed ${result.reviewed} overdue invoices`, `Created ${result.created} new actions`, `${result.created - approvals} routine reminders queued · ${approvals} sent for approval`]);
  } catch (error) { return failed(error); }
}

export async function checkPromises(): Promise<JobResult> {
  try {
    const context = getRequestContext(); requireManager(context);
    const result = await repository.checkPromises(context.companyId);
    return done("Promise check finished", [`Checked ${result.checked} promises due by ${await repository.today(context.companyId)}`, `${result.fulfilled} kept · ${result.missed} missed and escalated`]);
  } catch (error) { return failed(error); }
}

/** Local stand-in for the n8n Gmail workflow: drafts and logs reminders without sending any email. */
export async function dispatchRemindersLocally(): Promise<JobResult> {
  try {
    const context = getRequestContext(); requireManager(context);
    const queue = (await repository.listActions(context.companyId)).filter((action) => action.actionType === "reminder" && (action.status === "pending" || action.status === "approved")).slice(0, 10);
    const lines: string[] = [];
    for (const action of queue) {
      const invoice = (await repository.getInvoice(context.companyId, action.invoiceId))!;
      const customer = (await repository.getCustomer(context.companyId, action.customerId))!;
      const draft = await generateReminder({ customer, invoice, tone: String(action.dataSnapshot.tone || "friendly") as "friendly" | "firm" | "urgent" });
      await repository.markActionExecuted(context.companyId, action.id, { subject: draft.subject, body: draft.body, externalMessageId: `local-simulated-${randomUUID()}` });
      lines.push(`${invoice.invoiceNumber} → ${customer.email} (${draft.provider})`);
    }
    return done(queue.length ? `Logged ${queue.length} reminders (simulated, nothing emailed)` : "No reminders queued", lines.length ? lines : ["Run the daily monitor first to queue reminders."]);
  } catch (error) { return failed(error); }
}

export async function simulateReply(formData: FormData): Promise<JobResult> {
  try {
    const context = getRequestContext(); requireManager(context);
    const caseId = String(formData.get("caseId") || "");
    const body = String(formData.get("body") || "").trim();
    if (!caseId || !body) throw new Error("Choose a case and write a reply");
    const item = await repository.getCase(context.companyId, caseId);
    if (!item) throw new Error("Case not found");
    const classification = await classifyCustomerReply(body, await repository.today(context.companyId));
    const result = await repository.recordReply(context.companyId, { from: item.customer.email, subject: `Re: Payment reminder ${item.invoice.invoiceNumber}`, body, externalMessageId: `local-simulated-${randomUUID()}` }, classification);
    return done(`Classified as ${classification.intent.replaceAll("_", " ")}`, [
      `Confidence ${classification.confidence.toFixed(2)}${classification.promised_date ? ` · promised for ${classification.promised_date}` : ""}`,
      `Outcome: ${result.outcome}`,
      result.requiresHuman ? "Routed to the approval queue" : result.promiseId ? "Promise recorded; routine reminders paused" : "No financial action taken",
    ]);
  } catch (error) { return failed(error); }
}

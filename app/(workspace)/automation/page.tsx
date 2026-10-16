import type { Metadata } from "next";
import { ActivityFeed } from "@/components/activity-feed";
import { AutomationConsole } from "@/components/automation-console";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { formatMoney } from "@/lib/domain/money";

export const metadata: Metadata = { title: "Automation" };
export const dynamic = "force-dynamic";

const WORKFLOWS = [
  ["01-daily-collection-monitor.json", "POST /api/automation/daily-monitor"],
  ["02-send-collection-reminder.json", "POST /api/automation/reminders/:id/generate"],
  ["03-process-customer-reply.json", "POST /api/automation/replies/process"],
  ["04-payment-promise-monitor.json", "POST /api/automation/promises/check"],
  ["05-daily-management-summary.json", "GET /api/automation/summary"],
];

export default async function AutomationPage() {
  const { companyId } = getRequestContext();
  const replyCases = (await repository.listCases(companyId, { statuses: ["reminder_sent", "overdue", "reminder_pending", "customer_replied"] })).slice(0, 25)
    .map((item) => ({ id: item.id, label: `${item.invoice.invoiceNumber} · ${item.customer.name} · ${formatMoney(item.invoice.amountOutstanding)}` }));
  const llm = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operations" title="The jobs behind the scenes." muted="Run them by hand, watch what they record." />
      <AutomationConsole replyCases={replyCases} />
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="panel overflow-hidden">
          <SectionTitle title="Automation log" helper="Latest audit events from jobs and AERA" />
          <ActivityFeed events={await repository.listAudit(companyId, { limit: 10 })} empty="No jobs have run yet" />
        </article>
        <article className="panel overflow-hidden">
          <SectionTitle title="Integrations" helper="What is connected in this environment" />
          <ul className="divide-y divide-line/70 text-[13px]">
            <li className="flex items-center justify-between gap-4 px-5 py-3.5"><span className="font-medium">Data adapter</span><span className="font-mono text-[11.5px] text-muted">mock · fictional demo dataset</span></li>
            <li className="flex items-center justify-between gap-4 px-5 py-3.5"><span className="font-medium">Language model</span><span className={`font-mono text-[11.5px] ${llm ? "text-success" : "text-muted"}`}>{llm ? `OpenAI · ${process.env.OPENAI_MODEL}` : "Local deterministic fallback"}</span></li>
            <li className="flex items-center justify-between gap-4 px-5 py-3.5"><span className="font-medium">Gmail</span><span className="font-mono text-[11.5px] text-warning">Configure inside n8n</span></li>
            {WORKFLOWS.map(([file, endpoint]) => <li key={file} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3"><span className="font-mono text-[11.5px]">n8n/workflows/{file}</span><span className="font-mono text-[11px] text-muted">{endpoint}</span></li>)}
          </ul>
        </article>
      </section>
    </div>
  );
}

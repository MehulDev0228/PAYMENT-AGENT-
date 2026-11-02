import type { Metadata } from "next";
import { Ban, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { getSessionContext } from "@/lib/auth";
import { repository } from "@/lib/data";

export const metadata: Metadata = { title: "Rules" };

const PRINCIPLES = [
  { icon: Mail, title: "Routine runs itself", body: "Approved reminder templates go out on schedule without individual review." },
  { icon: ShieldCheck, title: "Money waits for people", body: "Discounts, plans, disputes, term changes and legal steps always need approval." },
  { icon: LockKeyhole, title: "One company, one boundary", body: "Company context is applied before every query and every write." },
];

const NEVER = ["Approve discounts", "Waive balances", "Change payment terms", "Approve payment plans", "Start legal escalation", "Suspend accounts", "Silently edit financial records", "Close a case on a customer's word"];

export default async function PolicyPage() {
  const policy = await repository.policy((await getSessionContext()).companyId);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Rules" title="Your rules decide. AI only writes." muted="Here is exactly where the line sits." />
      <section className="stagger-in grid gap-4 md:grid-cols-3">
        {PRINCIPLES.map(({ icon: Icon, title, body }) => (
          <article key={title} className="panel p-5">
            <Icon size={18} className="text-brand" aria-hidden="true" />
            <h2 className="mt-5 text-[16px] font-medium tracking-[-0.02em]">{title}</h2>
            <p className="mt-1.5 text-[13.5px] leading-6 text-muted">{body}</p>
          </article>
        ))}
      </section>

      <section className="panel overflow-hidden">
        <SectionTitle title="When reminders go out" helper="Checked every day against how late each bill is." />
        <ol className="stagger-in">
          {policy.steps.map((step, index) => (
            <li key={step.id} className="grid gap-3 border-b border-line/70 px-5 py-5 last:border-0 md:grid-cols-[64px_120px_minmax(0,1fr)_200px] md:items-center">
              <span className="font-mono text-[11px] text-muted">0{index + 1}</span>
              <p className="tabular text-[22px] font-medium tracking-[-0.04em]">{step.daysOverdue === 0 ? "Due date" : `${step.daysOverdue} days late`}</p>
              <div>
                <p className="font-medium">{step.action === "reminder" ? "Send a polite reminder" : "Flag for a call"}{step.escalationLevel ? ` · ${step.escalationLevel.replaceAll("_", " ")}` : ""}</p>
                <p className="mt-0.5 text-[13px] text-muted">{step.tone === "friendly" ? "Friendly" : step.tone === "firm" ? "Firm but polite" : "Urgent but polite"} tone</p>
              </div>
              <StatusBadge value={step.requiresHumanApproval ? "awaiting_approval" : "executed"} label={step.requiresHumanApproval ? "Needs approval" : "Automatic"} className="justify-self-start md:justify-self-end" />
            </li>
          ))}
        </ol>
      </section>

      <section className="overflow-hidden rounded-2xl bg-ink p-6 text-white md:p-8">
        <p className="eyebrow text-[10.5px] text-white/45">Hard limits</p>
        <h2 className="mt-3 text-[26px] font-medium leading-tight tracking-[-0.035em]">What KindlyPay will never do.<span className="block text-white/45">No setting turns these on.</span></h2>
        <ul className="stagger-in mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {NEVER.map((item) => <li key={item} className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3 text-[13.5px]"><Ban size={15} className="shrink-0 text-[#ff8a7a]" aria-hidden="true" />{item}</li>)}
        </ul>
      </section>
    </div>
  );
}

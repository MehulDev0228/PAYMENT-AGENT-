import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { formatDate } from "@/components/ui";
import { ROLE_LABELS, getPageContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { CASE_VIEWS } from "@/lib/domain/case-views";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await getPageContext();
  const viewer = { name: context.name, role: `${ROLE_LABELS[context.role]}${context.regions ? ` · ${context.regions.join(", ")}` : ""}`, devMode: context.mode === "dev" };
  const counts = {
    approvals: (await repository.listActions(context, "awaiting_approval")).length,
    review: (await repository.listPayments(context, "payment_match_review_required")).length,
    attention: (await repository.listCases(context, { statuses: CASE_VIEWS.attention.statuses })).length,
  };
  const businessDate = formatDate(await repository.today(context));
  return (
    <div className="min-h-dvh">
      <Sidebar counts={counts} businessDate={businessDate} />
      <div className="lg:pl-[260px]">
        <Topbar counts={counts} businessDate={businessDate} viewer={viewer} />
        <main id="main" className="mx-auto max-w-[1440px] px-4 pb-20 pt-7 md:px-8">{children}</main>
      </div>
    </div>
  );
}

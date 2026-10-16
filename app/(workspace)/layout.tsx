import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { formatDate } from "@/components/ui";
import { getRequestContext } from "@/lib/auth";
import { repository } from "@/lib/data";
import { CASE_VIEWS } from "@/lib/domain/case-views";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { companyId } = getRequestContext();
  const counts = {
    approvals: (await repository.listActions(companyId, "awaiting_approval")).length,
    review: (await repository.listPayments(companyId, "payment_match_review_required")).length,
    attention: (await repository.listCases(companyId, { statuses: CASE_VIEWS.attention.statuses })).length,
  };
  const businessDate = formatDate(await repository.today(companyId));
  return (
    <div className="min-h-dvh">
      <Sidebar counts={counts} businessDate={businessDate} />
      <div className="lg:pl-[260px]">
        <Topbar counts={counts} businessDate={businessDate} />
        <main id="main" className="mx-auto max-w-[1440px] px-4 pb-20 pt-7 md:px-8">{children}</main>
      </div>
    </div>
  );
}

import { Suspense } from "react";
import { ProductTour } from "@/components/shell/product-tour";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { formatDate } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { repository } from "@/lib/data";
import { CASE_VIEWS } from "@/lib/domain/case-views";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const { companyId } = session;
  const counts = {
    approvals: (await repository.listActions(companyId, "awaiting_approval")).length,
    review: (await repository.listPayments(companyId, "payment_match_review_required")).length,
    attention: (await repository.listCases(companyId, { statuses: CASE_VIEWS.attention.statuses })).length,
  };
  const businessDate = formatDate(await repository.today(companyId));
  const user = { name: session.name, email: session.email, companyName: session.companyName, role: session.role, demo: session.demo };
  return (
    <div className="min-h-dvh">
      <Sidebar counts={counts} businessDate={businessDate} />
      <div className="lg:pl-[260px]">
        <Topbar counts={counts} businessDate={businessDate} user={user} />
        <main id="main" className="mx-auto max-w-[1440px] px-4 pb-20 pt-7 md:px-8">{children}</main>
      </div>
      <Suspense fallback={null}><ProductTour tourKey={session.userId} firstName={session.name.split(" ")[0] ?? session.name} /></Suspense>
    </div>
  );
}

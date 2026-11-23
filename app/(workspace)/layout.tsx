import { Suspense } from "react";
import { ProductTour } from "@/components/shell/product-tour";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { formatDate } from "@/components/ui";
import { getPageContext } from "@/lib/auth";
import { DEMO_COMPANY_ID } from "@/lib/data/seed";
import { repository } from "@/lib/data";
import { CASE_VIEWS } from "@/lib/domain/case-views";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await getPageContext();
  const user = {
    name: context.name, email: context.email ?? "", companyName: context.companyName, role: context.role, regions: context.regions,
    devMode: context.mode === "dev", demo: context.mode === "supabase" && context.companyId === DEMO_COMPANY_ID,
  };
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
        <Topbar counts={counts} businessDate={businessDate} user={user} />
        <main id="main" className="mx-auto max-w-[1440px] px-4 pb-20 pt-7 md:px-8">{children}</main>
      </div>
      <Suspense fallback={null}><ProductTour tourKey={context.userId} firstName={context.name.split(" ")[0] ?? context.name} /></Suspense>
    </div>
  );
}

import type { Metadata } from "next";
import { AskAera } from "@/components/ask-aera";
import { PageHeader } from "@/components/ui";
import { getPageContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Ask AERA" };
export const dynamic = "force-dynamic";

export default async function AskPage() {
  await getPageContext();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Receivables intelligence" title="Ask AERA." muted="Read-only answers, each with its source." />
      <AskAera />
    </div>
  );
}

import type { Metadata } from "next";
import { AskAera } from "@/components/ask-aera";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Ask AERA" };

export default function AskPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Receivables intelligence" title="Ask AERA." muted="Read-only answers, each with its source." />
      <AskAera />
    </div>
  );
}

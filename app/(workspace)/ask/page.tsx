import type { Metadata } from "next";
import { AskKindlyPay } from "@/components/ask-kindlypay";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Ask KindlyPay" };

export default function AskPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Receivables intelligence" title="Ask KindlyPay." muted="Read-only answers, each with its source." />
      <AskKindlyPay />
    </div>
  );
}

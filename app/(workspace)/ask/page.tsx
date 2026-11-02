import type { Metadata } from "next";
import { AskKindlyPay } from "@/components/ask-kindlypay";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Ask KindlyPay" };

export default function AskPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Ask KindlyPay" title="Ask in plain words." muted="Every answer shows where the number came from." />
      <AskKindlyPay />
    </div>
  );
}

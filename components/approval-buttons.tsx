"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

export function ApprovalButtons({ actionId, size = "md" }: { actionId: string; size?: "sm" | "md" }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function decide(decision: "approve" | "reject") {
    setBusy(decision); setError("");
    try {
      const response = await fetch(`/api/collections/actions/${actionId}/${decision}`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).error || "Decision failed");
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Decision failed");
    } finally {
      setBusy(null);
    }
  }

  const sizing = size === "sm" ? "btn-sm" : "";
  return (
    <div>
      <div className="flex gap-2">
        <button type="button" disabled={busy !== null} onClick={() => decide("approve")} className={`btn-primary ${sizing}`}><Check size={15} aria-hidden="true" />{busy === "approve" ? "Approving…" : "Approve"}</button>
        <button type="button" disabled={busy !== null} onClick={() => decide("reject")} className={`btn-outline ${sizing}`}><X size={15} aria-hidden="true" />{busy === "reject" ? "Rejecting…" : "Reject"}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Spinner, cx } from "./ui";

// Long enough to read the confirmation before the decided item leaves the queue.
const CONFIRM_MS = 700;

export function ApprovalButtons({ actionId, size = "md" }: { actionId: string; size?: "sm" | "md" }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [done, setDone] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function decide(decision: "approve" | "reject") {
    setBusy(decision); setError("");
    try {
      const response = await fetch(`/api/collections/actions/${actionId}/${decision}`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).error || "Decision failed");
      setDone(decision);
      setTimeout(() => startTransition(() => router.refresh()), CONFIRM_MS);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Decision failed");
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <span role="status" className={cx("animate-pop inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium", done === "approve" ? "bg-brand-soft text-success" : "bg-[#eef0f3] text-[#4a515d]")}>
        {done === "approve" ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
        {done === "approve" ? "Approved" : "Rejected"}
      </span>
    );
  }

  const sizing = size === "sm" ? "btn-sm" : "";
  return (
    <div>
      <div className="flex gap-2">
        <button type="button" disabled={busy !== null} onClick={() => decide("approve")} className={`btn-primary ${sizing}`}>{busy === "approve" ? <Spinner /> : <Check size={15} aria-hidden="true" />}{busy === "approve" ? "Approving…" : "Approve"}</button>
        <button type="button" disabled={busy !== null} onClick={() => decide("reject")} className={`btn-outline ${sizing}`}>{busy === "reject" ? <Spinner /> : <X size={15} aria-hidden="true" />}{busy === "reject" ? "Rejecting…" : "Reject"}</button>
      </div>
      {error && <p role="alert" className="animate-rise mt-2 text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}

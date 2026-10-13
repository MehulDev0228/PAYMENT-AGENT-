import { Bot, Cog, History, UserRound } from "lucide-react";
import type { AuditEvent } from "@/lib/domain/types";
import { EmptyState, cx, formatDate } from "./ui";

const ACTOR = {
  aera: { icon: Bot, label: "AERA", tone: "bg-ink text-glow" },
  human: { icon: UserRound, label: "Person", tone: "bg-lime text-lime-ink" },
  system: { icon: Cog, label: "System", tone: "bg-canvas text-muted border border-line" },
} as const;

export function humanizeEvent(eventType: string) {
  const text = eventType.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ActivityFeed({ events, empty = "No activity recorded yet." }: { events: AuditEvent[]; empty?: string }) {
  if (events.length === 0) return <EmptyState icon={History} title={empty} body="Every automated and human action is written to an append-only audit log." />;
  return (
    <ol className="divide-y divide-line/70">
      {events.map((event) => {
        const actor = ACTOR[event.actorType];
        const Icon = actor.icon;
        return (
          <li key={event.id} className="flex gap-3 px-5 py-3.5">
            <span className={cx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", actor.tone)} title={actor.label}><Icon size={14} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[13.5px] font-medium">{humanizeEvent(event.eventType)}</p>
                <time className="tabular shrink-0 font-mono text-[10.5px] text-muted">{formatDate(event.createdAt, true)}</time>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-muted">{event.reason}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

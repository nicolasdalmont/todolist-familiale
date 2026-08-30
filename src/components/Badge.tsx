import type { TaskStatus, Visibility } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/format";

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo: "bg-brand-soft text-brand-dark",
  in_progress: "bg-amber-50 text-amber-700",
  done: "bg-emerald-50 text-emerald-700",
  archived: "bg-slate-100 text-slate-500",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

const VISIBILITY_STYLES: Record<Visibility, string> = {
  shared: "bg-emerald-50 text-emerald-700",
  private: "bg-rose-50 text-rose-600",
};

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold ${VISIBILITY_STYLES[visibility]}`}>
      {visibility === "shared" ? "👥 Partagée" : "🔒 Privée"}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-[11.5px] font-bold text-rose-600">
      ⚠ En retard
    </span>
  );
}

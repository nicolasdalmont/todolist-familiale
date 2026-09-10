"use client";

import { useRouter } from "next/navigation";
import { setStatusAction } from "@/lib/actions";
import { useGlobalTransition } from "@/components/PendingOverlay";
import { useToast } from "@/components/Toast";
import { STATUS_LABELS } from "@/lib/format";
import type { TaskStatus } from "@/lib/types";
import { IconCheck } from "./Icons";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "archived"];

// Statut courant : fond plein coloré + coche (affordance non uniquement
// chromatique). Les autres : bouton clair cliquable bien lisible — pas un
// simple texte grisé, pour qu'on voie qu'ils sont actionnables.
const ACTIVE_STYLES: Record<TaskStatus, string> = {
  todo: "border-transparent bg-ink text-white",
  in_progress: "border-transparent bg-brand text-white",
  done: "border-transparent bg-emerald-600 text-white",
  archived: "border-transparent bg-stone-500 text-white",
};

export function StatusButtons({ taskId, current }: { taskId: string; current: TaskStatus }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useGlobalTransition();

  function handleClick(status: TaskStatus) {
    if (status === current) return;
    startTransition(async () => {
      await setStatusAction(taskId, status);
      router.refresh();
      toast.show({ message: `Statut : ${STATUS_LABELS[status]}`, tone: "success" });
    });
  }

  return (
    <div role="group" aria-label="Changer le statut de la tâche" className="mt-3 flex flex-wrap gap-2">
      {STATUSES.map((status) => {
        const isCurrent = status === current;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={isCurrent}
            disabled={isPending}
            onClick={() => handleClick(status)}
            className={`flex items-center gap-1 rounded-full border px-3.5 py-2 text-[12.5px] font-bold disabled:opacity-50 ${
              isCurrent ? ACTIVE_STYLES[status] : "border-line bg-surface text-ink-muted hover:border-brand/50 hover:text-ink"
            }`}
          >
            {isCurrent ? <IconCheck className="h-3.5 w-3.5" /> : null}
            {STATUS_LABELS[status]}
          </button>
        );
      })}
    </div>
  );
}

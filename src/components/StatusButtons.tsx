"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStatusAction } from "@/lib/actions";
import { STATUS_LABELS } from "@/lib/format";
import type { TaskStatus } from "@/lib/types";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "archived"];

const ACTIVE_STYLES: Record<TaskStatus, string> = {
  todo: "border-transparent bg-brand-soft text-brand-dark",
  in_progress: "border-transparent bg-amber-50 text-amber-700",
  done: "border-transparent bg-emerald-50 text-emerald-700",
  archived: "border-transparent bg-slate-100 text-slate-500",
};

export function StatusButtons({ taskId, current }: { taskId: string; current: TaskStatus }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick(status: TaskStatus) {
    startTransition(async () => {
      await setStatusAction(taskId, status);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          disabled={isPending}
          onClick={() => handleClick(status)}
          className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold disabled:opacity-50 ${
            status === current ? ACTIVE_STYLES[status] : "border-slate-200 text-ink-muted"
          }`}
        >
          {STATUS_LABELS[status]}
        </button>
      ))}
    </div>
  );
}

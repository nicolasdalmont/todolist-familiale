"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addCommentAction } from "@/lib/actions";
import { useGlobalTransition } from "@/components/PendingOverlay";

export function CommentForm({ taskId }: { taskId: string }) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useGlobalTransition();
  const router = useRouter();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const body = value.trim();
    if (!body) return;

    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set("body", body);

    startTransition(async () => {
      await addCommentAction(formData);
      setValue("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mb-3.5 mt-1 flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Écrire un commentaire..."
        required
        className="flex-1 rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-brand px-4 font-bold text-white disabled:opacity-50"
      >
        Ajouter
      </button>
    </form>
  );
}

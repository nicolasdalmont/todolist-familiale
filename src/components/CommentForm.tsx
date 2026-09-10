"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addCommentAction } from "@/lib/actions";
import { useGlobalTransition } from "@/components/PendingOverlay";
import { useToast } from "@/components/Toast";

export function CommentForm({ taskId }: { taskId: string }) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useGlobalTransition();
  const router = useRouter();
  const toast = useToast();
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Zone de saisie à hauteur automatique (audit UX UX-13) : commence sur
  // une ligne, grandit avec le texte jusqu'à ~6 lignes puis défile. Entrée
  // insère un retour à la ligne ; Ctrl/Cmd+Entrée envoie.
  function grow() {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  function submit() {
    const body = value.trim();
    if (!body) return;

    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set("body", body);

    startTransition(async () => {
      await addCommentAction(formData);
      setValue("");
      if (areaRef.current) areaRef.current.style.height = "auto";
      router.refresh();
      toast.show({ message: "Commentaire ajouté", tone: "success" });
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-3.5 mt-1 flex items-start gap-2">
      <textarea
        ref={areaRef}
        rows={1}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          grow();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Écrire un commentaire..."
        className="max-h-[140px] flex-1 resize-none rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
      />
      <button
        type="submit"
        disabled={isPending}
        className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
      >
        Ajouter
      </button>
    </form>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

// Suppression « à la Gmail » (audit UX INC-10) : l'élément disparaît tout
// de suite de la liste, un toast « … supprimé · Annuler » laisse quelques
// secondes pour revenir en arrière, et la suppression serveur n'est
// réellement envoyée qu'à l'expiration du délai. Si l'utilisateur quitte
// l'écran avant, les suppressions en attente sont quand même envoyées
// (flush au démontage) — on ne perd jamais une action confirmée.
export function useUndoableDelete({
  perform,
  message,
  delay = 5000,
}: {
  perform: (id: string) => Promise<unknown>;
  message: string;
  delay?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const performRef = useRef(perform);
  performRef.current = perform;

  const commit = useCallback(
    async (id: string) => {
      timers.current.delete(id);
      await performRef.current(id);
      router.refresh();
    },
    [router]
  );

  const remove = useCallback(
    (id: string) => {
      setPending((p) => new Set(p).add(id));
      timers.current.set(
        id,
        setTimeout(() => void commit(id), delay)
      );
      toast.show({
        message,
        action: {
          label: "Annuler",
          onClick: () => {
            const t = timers.current.get(id);
            if (t) clearTimeout(t);
            timers.current.delete(id);
            setPending((p) => {
              const next = new Set(p);
              next.delete(id);
              return next;
            });
          },
        },
      });
    },
    [commit, delay, message, toast]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t, id) => {
        clearTimeout(t);
        void performRef.current(id);
      });
      map.clear();
    };
  }, []);

  return { pending, remove };
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition as useReactTransition,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";

// Gèle l'écran (overlay plein écran + indicateur "en cours") pendant toute
// action qui modifie une tâche (création, modification, suppression,
// changement de statut, item de checklist, commentaire, connexion...) et
// jusqu'à ce que l'écran résultant soit effectivement réaffiché — pas
// seulement le temps de la requête serveur. Demandé après plusieurs
// remarques : sans ça, chaque bouton ne désactivait que lui-même
// (useTransition local, voir StatusButtons/ChecklistSection/CommentForm)
// et le reste de l'écran restait cliquable pendant l'attente.
//
// Principe : un compteur global (pas un simple booléen) dans un contexte
// React, incrémenté au début d'une action et décrémenté à la fin — un
// compteur plutôt qu'un booléen pour rester correct si deux actions
// devaient se chevaucher. Deux façons de s'y raccorder :
//   - useGlobalTransition() : remplace React.useTransition tel quel pour
//     les actions déclenchées manuellement (bouton, formulaire contrôlé en
//     JS) — voir StatusButtons.tsx, ChecklistSection.tsx, CommentForm.tsx,
//     LoginForm.tsx, et le bouton de suppression dans TaskForm.tsx.
//   - <FormPendingBridge /> : à poser comme enfant direct d'un <form
//     action={serverAction}> natif (TaskForm.tsx pour créer/modifier,
//     LogoutButton.tsx) — s'appuie sur useFormStatus(), qui reste "pending"
//     jusqu'à la fin d'une redirection déclenchée côté serveur par
//     redirect(), pas seulement jusqu'à la réponse réseau.

const PendingContext = createContext<{ begin: () => void; end: () => void } | null>(null);

export function PendingOverlayProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const begin = useCallback(() => setCount((c) => c + 1), []);
  const end = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);

  // Empêche aussi le défilement de l'écran en dessous de l'overlay, pour
  // que le gel soit total tant qu'une action est en cours.
  useEffect(() => {
    document.body.style.overflow = count > 0 ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [count]);

  return (
    <PendingContext.Provider value={{ begin, end }}>
      {children}
      {count > 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/10 backdrop-blur-[1px]"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3.5 shadow-lg">
            <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <span className="text-[13.5px] font-semibold text-ink">Veuillez patienter...</span>
          </div>
        </div>
      ) : null}
    </PendingContext.Provider>
  );
}

// Remplace React.useTransition : même signature ([isPending, start]),
// mais `start` gèle aussi l'écran en plus de piloter la transition locale
// (toujours utile pour désactiver un bouton précis pendant l'action).
export function useGlobalTransition(): [boolean, (callback: () => void | Promise<void>) => void] {
  const ctx = useContext(PendingContext);
  const [isPending, startTransition] = useReactTransition();

  const start = useCallback(
    (callback: () => void | Promise<void>) => {
      ctx?.begin();
      startTransition(async () => {
        try {
          await callback();
        } finally {
          ctx?.end();
        }
      });
    },
    [ctx, startTransition]
  );

  return [isPending, start];
}

// À poser comme enfant direct d'un <form action={serverAction}> natif.
// useFormStatus() ne peut être appelé que dans un composant enfant du
// formulaire concerné, jamais dans le formulaire lui-même — d'où ce petit
// composant séparé qui ne rend rien.
export function FormPendingBridge() {
  const { pending } = useFormStatus();
  const ctx = useContext(PendingContext);
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending && !wasPending.current) {
      wasPending.current = true;
      ctx?.begin();
    } else if (!pending && wasPending.current) {
      wasPending.current = false;
      ctx?.end();
    }
  }, [pending, ctx]);

  // Ceinture-bretelles : si le composant est démonté (navigation) alors
  // qu'il avait signalé un début, on relâche l'overlay pour ne jamais le
  // laisser gelé indéfiniment.
  useEffect(() => {
    return () => {
      if (wasPending.current) {
        wasPending.current = false;
        ctx?.end();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

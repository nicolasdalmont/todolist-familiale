"use client";

import { useEffect } from "react";
import Link from "next/link";
import { IconBerry } from "@/components/Icons";

// Error boundary global (audit UX UX-7) : sans ce fichier, une exception
// levée par une Server Action (échec de permission, coupure Supabase…)
// affichait l'écran d'erreur brut de Next. Ici : un message à la marque et
// deux issues (réessayer / revenir à l'accueil).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-paper p-6 text-center">
      <IconBerry className="h-14 w-14" />
      <div>
        <h1 className="text-lg font-extrabold">Quelque chose a coincé</h1>
        <p className="mx-auto mt-1 max-w-xs text-[13.5px] text-ink-muted">
          L&apos;action n&apos;a pas pu aboutir. Réessaie dans un instant — si ça persiste, reviens à
          l&apos;accueil.
        </p>
      </div>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-bold text-white"
        >
          Réessayer
        </button>
        <Link
          href="/"
          className="rounded-xl border border-line bg-surface px-4 py-2.5 text-[13.5px] font-bold text-ink-muted"
        >
          Accueil
        </Link>
      </div>
    </div>
  );
}

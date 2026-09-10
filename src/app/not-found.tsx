import Link from "next/link";
import { IconBerry } from "@/components/Icons";

// 404 à la marque (audit UX UX-7). Sert aussi aux notFound() volontaires
// (tâche non partagée, écran admin d'un non-admin) : dans une famille,
// l'existence d'une tâche n'est pas un secret, un message clair vaut mieux
// qu'un 404 nu.
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-paper p-6 text-center">
      <IconBerry className="h-14 w-14" />
      <div>
        <h1 className="text-lg font-extrabold">Introuvable</h1>
        <p className="mx-auto mt-1 max-w-xs text-[13.5px] text-ink-muted">
          Cette page n&apos;existe pas, ou la tâche ne t&apos;est plus partagée.
        </p>
      </div>
      <Link href="/" className="rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-bold text-white">
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}

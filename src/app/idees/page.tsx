import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getIdeas } from "@/lib/ideas-queries";
import { Topbar } from "@/components/Topbar";
import { IdeesScreen } from "@/components/IdeesScreen";
import { HelpButton } from "@/components/HelpButton";
import { IconArrowLeft, IconBulb } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Onglet Idées (migration 010) — boîte à idées familiale, ouverte à tout
// membre connecté (pas réservée à l'admin, même logique que Jardin/
// Voiture/Santé/Finances). Pas rattachée au système de bascule des
// agendas (src/lib/agendas.ts) : ce n'est pas une activité récurrente
// familiale mais une fonctionnalité permanente, au même titre que Tâches.
export default async function IdeesPage() {
  const profile = await requireUser();
  const ideas = await getIdeas();

  return (
    <div className="min-h-dvh bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-1 sm:pb-16">
        <div className="mb-4 mt-1.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              aria-label="Retour à l'accueil"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface"
            >
              <IconArrowLeft className="h-4 w-4" />
            </Link>
            <IconBulb className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-extrabold">Idées</h2>
          </div>
          <HelpButton title="Idées">
            <p>La boîte à idées de la famille : suggestions d&apos;amélioration, de sorties, de projets…</p>
            <ul>
              <li>Toute idée proposée est visible et modifiable par toute la famille.</li>
              <li>Le statut (Proposée / En cours / Réalisée) se change directement depuis la liste.</li>
              <li>Filtre par statut disponible en haut de la liste.</li>
            </ul>
          </HelpButton>
        </div>

        <IdeesScreen ideas={ideas} currentUserId={profile.id} />
      </main>
    </div>
  );
}

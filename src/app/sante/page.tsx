import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getHealthActivities } from "@/lib/health-queries";
import { getAppSettings, getProfiles } from "@/lib/queries";
import { isAgendaEnabled } from "@/lib/agendas";
import { parseAgendaActivityPrefill } from "@/lib/format";
import { Topbar } from "@/components/Topbar";
import { SanteScreen } from "@/components/SanteScreen";
import { HelpButton } from "@/components/HelpButton";
import { IconArrowLeft, IconHeart } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Onglet Santé (migration 007) : liste des activités récurrentes de santé,
// ouverte à tout membre connecté (comme Jardin/Voiture) — voir
// src/lib/health-actions.ts. Peut être désactivé depuis l'admin
// (migration 009 — src/lib/agendas.ts), voir jardin/page.tsx.
export default async function SantePage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const profile = await requireUser();
  const settings = await getAppSettings();
  if (!isAgendaEnabled(settings, "sante")) notFound();

  const [activities, members] = await Promise.all([getHealthActivities(), getProfiles()]);
  const prefill = parseAgendaActivityPrefill(searchParams);

  return (
    <div className="min-h-dvh bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-1 sm:pb-16">
        <div className="mb-4 mt-1.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <Link
              href="/agendas"
              aria-label="Retour aux agendas"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface"
            >
              <IconArrowLeft className="h-4 w-4" />
            </Link>
            <IconHeart className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-extrabold">Santé</h2>
          </div>
          <HelpButton title="Santé">
            <p>
              Les activités récurrentes de santé (visites médicales, dentiste, vaccins…), triées
              chronologiquement — même principe que Voiture.
            </p>
            <ul>
              <li>Chaque activité est une date précise avec sa propre récurrence (jours/semaines/mois/années).</li>
              <li>Clôturer une activité crée automatiquement l&apos;occurrence suivante.</li>
            </ul>
          </HelpButton>
        </div>

        <SanteScreen activities={activities} members={members} prefill={prefill} />
      </main>
    </div>
  );
}

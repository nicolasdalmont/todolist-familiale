import { requireUser } from "@/lib/auth";
import { getHealthActivities } from "@/lib/health-queries";
import { getProfiles } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { SanteScreen } from "@/components/SanteScreen";
import { IconHeart } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Onglet Santé (migration 007) : liste des activités récurrentes de santé,
// ouverte à tout membre connecté (comme Jardin/Voiture) — voir
// src/lib/health-actions.ts.
export default async function SantePage() {
  const profile = await requireUser();

  const [activities, members] = await Promise.all([getHealthActivities(), getProfiles()]);

  return (
    <div className="min-h-dvh bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-1 sm:pb-16">
        <div className="mb-4 mt-1.5 flex items-center gap-2">
          <IconHeart className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-extrabold">Santé</h2>
        </div>

        <SanteScreen activities={activities} members={members} />
      </main>
    </div>
  );
}

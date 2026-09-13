import { requireUser } from "@/lib/auth";
import { getCarActivities } from "@/lib/car-queries";
import { getProfiles } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { VoitureScreen } from "@/components/VoitureScreen";
import { IconCar } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Onglet Voiture (migration 005) : liste des activités récurrentes
// d'entretien de la voiture, ouverte à tout membre connecté (comme
// Jardin) — voir src/lib/car-actions.ts.
export default async function VoiturePage() {
  const profile = await requireUser();

  const [activities, members] = await Promise.all([getCarActivities(), getProfiles()]);

  return (
    <div className="min-h-dvh bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-1 sm:pb-16">
        <div className="mb-4 mt-1.5 flex items-center gap-2">
          <IconCar className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-extrabold">Voiture</h2>
        </div>

        <VoitureScreen activities={activities} members={members} />
      </main>
    </div>
  );
}

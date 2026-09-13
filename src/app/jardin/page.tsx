import { requireUser } from "@/lib/auth";
import { getGardenActivities } from "@/lib/garden-queries";
import { getProfiles } from "@/lib/queries";
import { currentParisYearMonth } from "@/lib/garden";
import { Topbar } from "@/components/Topbar";
import { JardinScreen } from "@/components/JardinScreen";
import { IconLeaf } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Onglet Jardin (migration 003) : liste des activités récurrentes du
// jardin, ouverte à tout membre connecté (pas réservée à l'admin,
// contrairement à /admin) — voir src/lib/garden-actions.ts.
export default async function JardinPage() {
  const profile = await requireUser();

  const [activities, members] = await Promise.all([getGardenActivities(), getProfiles()]);
  const { month } = currentParisYearMonth();

  return (
    <div className="min-h-dvh bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-1 sm:pb-16">
        <div className="mb-4 mt-1.5 flex items-center gap-2">
          <IconLeaf className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-extrabold">Jardin</h2>
        </div>

        <JardinScreen activities={activities} members={members} currentMonth={month} />
      </main>
    </div>
  );
}

import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getFamilyWeekActivity, getMyNotifications, getProfiles, getRecentActivity, getSharedTasksSnapshot, getTasks } from "@/lib/queries";
import { challengeNeedsMembers, evaluateChallenge, getCurrentChallenge } from "@/lib/challenges";
import { dateKeyFromDate } from "@/lib/format";
import { parisWallTimeToUtcIso } from "@/lib/timezone";
import { Topbar } from "@/components/Topbar";
import { HomeDashboard } from "@/components/HomeDashboard";
import { IconPlus } from "@/components/Icons";

// Voir la note dans src/app/tasks/page.tsx (et src/lib/db.ts) sur les
// pièges de cache Next.js déjà rencontrés sur ce projet — même précaution
// ici, cet écran affiche lui aussi des données qui doivent rester à jour.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await requireUser();

  // getTasks ne renvoie que les tâches visibles par profile.id (créées par
  // lui, ou partagées avec lui) — voir src/lib/access.ts.
  const tasks = await getTasks(profile.id);

  // Fenêtre large (48h) récupérée côté serveur ; le fil n'affiche ensuite
  // que "aujourd'hui" (clé de date locale calculée côté client, voir
  // ActivityFeed.tsx) — même principe que les compteurs du tableau de bord
  // pour éviter un décalage de fuseau horaire près de minuit. Restreint aux
  // tâches déjà filtrées par canView ci-dessus : impossible de voir
  // l'activité d'une tâche à laquelle on n'a pas accès.
  const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const [activity, notifications] = await Promise.all([
    getRecentActivity(
      tasks.map((t) => t.id),
      sinceIso
    ),
    getMyNotifications(profile.id),
  ]);

  // Défi familial de la semaine (src/lib/challenges.ts) — pas de requête
  // supplémentaire hors des 9 semaines couvertes (activeChallenge === null).
  const activeChallenge = getCurrentChallenge(dateKeyFromDate(new Date()));
  const challenge = activeChallenge
    ? await (async () => {
        const weekStartIso = parisWallTimeToUtcIso(`${activeChallenge.weekStart}T00:00`);
        const [familyActivity, sharedTasks, members] = await Promise.all([
          getFamilyWeekActivity(weekStartIso),
          getSharedTasksSnapshot(),
          challengeNeedsMembers(activeChallenge) ? getProfiles() : Promise.resolve([]),
        ]);
        return {
          challenge: activeChallenge,
          progress: evaluateChallenge(activeChallenge, { activity: familyActivity, sharedTasks, members }),
        };
      })()
    : null;

  return (
    <div className="min-h-dvh bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-28 pt-1">
        <HomeDashboard profile={profile} tasks={tasks} activity={activity} notifications={notifications} challenge={challenge} />
      </main>
      <Link
        href="/tasks/new"
        className="fixed bottom-safe right-5 hidden h-[58px] w-[58px] items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/40 sm:flex"
        title="Nouvelle tâche"
        aria-label="Nouvelle tâche"
      >
        <IconPlus className="h-6 w-6" />
      </Link>
    </div>
  );
}

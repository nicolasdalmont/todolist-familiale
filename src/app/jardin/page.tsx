import { requireUser } from "@/lib/auth";
import { getGardenActivities, getGardenActivityCategories } from "@/lib/garden-queries";
import { getProfiles } from "@/lib/queries";
import { currentParisYearMonth } from "@/lib/garden";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { JardinScreen } from "@/components/JardinScreen";
import { IconArrowLeft, IconLeaf } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Onglet Jardin (migration 003) : liste des activités récurrentes du
// jardin, ouverte à tout membre connecté (pas réservée à l'admin,
// contrairement à /admin) — voir src/lib/garden-actions.ts.
export default async function JardinPage() {
  const profile = await requireUser();

  const [activities, members, categories] = await Promise.all([
    getGardenActivities(),
    getProfiles(),
    getGardenActivityCategories(),
  ]);
  const { month } = currentParisYearMonth();

  return (
    <div className="min-h-dvh bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-1 sm:pb-16">
        <div className="mb-4 mt-1.5 flex items-center gap-2.5">
          <Link
            href="/agendas"
            aria-label="Retour aux agendas"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface"
          >
            <IconArrowLeft className="h-4 w-4" />
          </Link>
          <IconLeaf className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-extrabold">Jardin</h2>
        </div>

        <JardinScreen activities={activities} members={members} categories={categories} currentMonth={month} />
      </main>
    </div>
  );
}

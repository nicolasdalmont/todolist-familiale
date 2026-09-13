import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getFinancesActivities } from "@/lib/finances-queries";
import { getProfiles } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { FinancesScreen } from "@/components/FinancesScreen";
import { IconArrowLeft, IconEuro } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Onglet Finances (migration 008) : liste des activités récurrentes de
// finances, ouverte à tout membre connecté (comme Jardin/Voiture/Santé) —
// voir src/lib/finances-actions.ts.
export default async function FinancesPage() {
  const profile = await requireUser();

  const [activities, members] = await Promise.all([getFinancesActivities(), getProfiles()]);

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
          <IconEuro className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-extrabold">Finances</h2>
        </div>

        <FinancesScreen activities={activities} members={members} />
      </main>
    </div>
  );
}

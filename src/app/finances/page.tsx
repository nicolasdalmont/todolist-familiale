import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getFinancesActivities } from "@/lib/finances-queries";
import { getAppSettings, getProfiles } from "@/lib/queries";
import { isAgendaEnabled } from "@/lib/agendas";
import { parseAgendaActivityPrefill } from "@/lib/format";
import { Topbar } from "@/components/Topbar";
import { FinancesScreen } from "@/components/FinancesScreen";
import { IconArrowLeft, IconEuro } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Onglet Finances (migration 008) : liste des activités récurrentes de
// finances, ouverte à tout membre connecté (comme Jardin/Voiture/Santé) —
// voir src/lib/finances-actions.ts. Peut être désactivé depuis l'admin
// (migration 009 — src/lib/agendas.ts), voir jardin/page.tsx.
export default async function FinancesPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const profile = await requireUser();
  const settings = await getAppSettings();
  if (!isAgendaEnabled(settings, "finances")) notFound();

  const [activities, members] = await Promise.all([getFinancesActivities(), getProfiles()]);
  const prefill = parseAgendaActivityPrefill(searchParams);

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

        <FinancesScreen activities={activities} members={members} prefill={prefill} />
      </main>
    </div>
  );
}

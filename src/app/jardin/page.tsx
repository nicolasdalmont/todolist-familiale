import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getGardenActivities, getGardenActivityCategories } from "@/lib/garden-queries";
import { getAppSettings, getProfiles } from "@/lib/queries";
import { isAgendaEnabled } from "@/lib/agendas";
import { currentParisYearMonth } from "@/lib/garden";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { JardinScreen } from "@/components/JardinScreen";
import { IconArrowLeft, IconLeaf } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Onglet Jardin (migration 003) : liste des activités récurrentes du
// jardin, ouverte à tout membre connecté (pas réservée à l'admin,
// contrairement à /admin) — voir src/lib/garden-actions.ts. Peut être
// désactivé depuis l'admin (migration 009 — src/lib/agendas.ts) : traité
// comme une page inexistante plutôt qu'une redirection, même logique que
// /admin pour un compte non-admin.
export default async function JardinPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const profile = await requireUser();
  const settings = await getAppSettings();
  if (!isAgendaEnabled(settings, "jardin")) notFound();

  const [activities, members, categories] = await Promise.all([
    getGardenActivities(),
    getProfiles(),
    getGardenActivityCategories(),
  ]);
  const { month } = currentParisYearMonth();

  // Prérempli depuis TaskForm.tsx quand l'utilisateur choisit de créer une
  // activité Jardin plutôt qu'une tâche (voir AGENDA_CATEGORY_INFO).
  const prefillName = typeof searchParams.prefillName === "string" ? searchParams.prefillName : undefined;
  const prefill = prefillName
    ? {
        name: prefillName,
        description: typeof searchParams.prefillDescription === "string" ? searchParams.prefillDescription : "",
        month: typeof searchParams.prefillMonth === "string" ? Number(searchParams.prefillMonth) || null : null,
      }
    : undefined;

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

        <JardinScreen
          activities={activities}
          members={members}
          categories={categories}
          currentMonth={month}
          prefill={prefill}
        />
      </main>
    </div>
  );
}

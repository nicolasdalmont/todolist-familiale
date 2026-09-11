import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCategories, getTags, getTasks } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { TaskFilterList } from "@/components/TaskFilterList";
import { IconPlus } from "@/components/Icons";

// Ceinture-bretelles en plus du "cache: no-store" déjà forcé sur `sql`
// (voir src/lib/db.ts) : garantit qu'aucune couche de cache Next.js ne
// serve un instantané périmé de la liste des tâches sur cette page.
export const dynamic = "force-dynamic";

// La portée (mes tâches / toutes), le statut, la catégorie, les tags,
// l'échéance, le partagé/privé, "en retard uniquement" et la recherche
// sont tous des filtres appliqués côté client dans TaskFilterList (voir ce
// composant) — plus d'onglets ni de paramètre "?filter=" côté serveur
// (retiré le 03/09/2026, ancien composant FilterTabs.tsx à supprimer sur
// GitHub, voir le message de livraison). getTasks() reste le seul filtrage
// serveur : il ne renvoie que ce qui est visible par profile.id (créé par
// lui, ou partagé avec lui) — voir src/lib/access.ts.
export default async function TasksPage({
  searchParams,
}: {
  searchParams: { dueFrom?: string; dueAtMost?: string; overdue?: string; readOnly?: string };
}) {
  const profile = await requireUser();

  const [tasks, allTags, categories] = await Promise.all([
    getTasks(profile.id),
    getTags(),
    getCategories(),
  ]);

  return (
    <div className="min-h-dvh bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-28 pt-1">
        <TaskFilterList
          tasks={tasks}
          allTags={allTags}
          categories={categories}
          currentUserId={profile.id}
          initialDueFrom={searchParams.dueFrom}
          initialDueAtMost={searchParams.dueAtMost}
          initialOverdueOnly={searchParams.overdue === "1"}
          initialReadOnly={searchParams.readOnly === "1"}
        />
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

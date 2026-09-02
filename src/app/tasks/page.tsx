import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTags, getTasks } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { FilterTabs } from "@/components/FilterTabs";
import { TaskFilterList } from "@/components/TaskFilterList";
import { IconPlus } from "@/components/Icons";
import type { Task } from "@/lib/types";

// Ceinture-bretelles en plus du "cache: no-store" déjà forcé dans le client
// Supabase admin (voir src/lib/supabase/admin.ts) : garantit qu'aucune
// couche de cache Next.js ne serve un instantané périmé de la liste des
// tâches sur cette page.
export const dynamic = "force-dynamic";

// "Toutes" = tout ce qui m'est visible (déjà limité par getTasks à ce que
// je peux voir — voir src/lib/access.ts). "Mes tâches" = uniquement les
// tâches que j'ai créées (un sous-ensemble : les tâches que d'autres ont
// partagées avec moi n'y figurent pas). Le statut, la visibilité
// partagée/privée, la catégorie, les tags, l'échéance et la recherche sont
// désormais tous des filtres additionnels dans TaskFilterList, pas des
// onglets séparés.
function applyFilter(tasks: Task[], filter: string, userId: string): Task[] {
  if (filter === "mine") return tasks.filter((t) => t.created_by === userId);
  return tasks;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { filter?: string; dueAtMost?: string };
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  // getTasks ne renvoie que les tâches visibles par profile.id (créées par
  // lui, ou partagées avec lui) — voir src/lib/access.ts.
  const supabase = createAdminClient();
  const [tasks, allTags] = await Promise.all([getTasks(supabase, profile.id), getTags(supabase)]);
  const filter = searchParams.filter ?? "all";
  const filtered = applyFilter(tasks, filter, profile.id);

  return (
    <div className="min-h-screen bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-28 pt-1">
        <FilterTabs active={filter} />
        <TaskFilterList tasks={filtered} allTags={allTags} initialDueAtMost={searchParams.dueAtMost} />
      </main>
      <Link
        href="/tasks/new"
        className="fixed bottom-7 right-5 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/40"
        title="Nouvelle tâche"
      >
        <IconPlus className="h-6 w-6" />
      </Link>
    </div>
  );
}

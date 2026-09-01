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

function applyFilter(tasks: Task[], filter: string, userId: string): Task[] {
  switch (filter) {
    case "mine":
      return tasks.filter((t) => (t.assignees ?? []).some((a) => a.id === userId));
    case "shared":
      return tasks.filter((t) => t.visibility === "shared");
    case "private":
      return tasks.filter((t) => t.visibility === "private" && t.created_by === userId);
    case "done":
      return tasks.filter((t) => t.status === "done");
    case "archived":
      return tasks.filter((t) => t.status === "archived");
    default:
      return tasks.filter((t) => t.status !== "archived");
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  // Il n'y a plus de RLS par utilisateur (voir supabase/schema.sql) : le
  // filtrage "partagé / privé" est appliqué ici, côté application.
  const supabase = createAdminClient();
  const [tasks, allTags] = await Promise.all([getTasks(supabase), getTags(supabase)]);
  const filter = searchParams.filter ?? "all";
  const filtered = applyFilter(tasks, filter, profile.id);

  return (
    <div className="min-h-screen bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-28 pt-1">
        <FilterTabs active={filter} />
        <TaskFilterList tasks={filtered} allTags={allTags} />
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

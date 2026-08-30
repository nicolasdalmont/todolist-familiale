import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getTasks } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { FilterTabs } from "@/components/FilterTabs";
import { TaskCard } from "@/components/TaskCard";
import type { Task } from "@/lib/types";

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
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getProfile(supabase, user.id);
  if (!profile) redirect("/login");

  // Row Level Security ne renvoie déjà que les tâches visibles par
  // l'utilisateur (partagées, ou privées dont il est le créateur).
  const tasks = await getTasks(supabase);
  const filter = searchParams.filter ?? "all";
  const filtered = applyFilter(tasks, filter, user.id);

  return (
    <div className="min-h-screen bg-[#f6f5fb]">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-28 pt-1">
        <FilterTabs active={filter} />
        <div className="flex flex-col gap-2.5">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-ink-muted">
              Aucune tâche ici pour le moment.
              <br />
              Appuie sur + pour en créer une.
            </div>
          ) : (
            filtered.map((task) => <TaskCard key={task.id} task={task} />)
          )}
        </div>
      </main>
      <Link
        href="/tasks/new"
        className="fixed bottom-7 right-5 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-brand text-3xl text-white shadow-lg shadow-brand/40"
        title="Nouvelle tâche"
      >
        +
      </Link>
    </div>
  );
}

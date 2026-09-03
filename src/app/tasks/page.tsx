import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTags, getTasks } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { TaskFilterList } from "@/components/TaskFilterList";
import { IconPlus } from "@/components/Icons";

// Ceinture-bretelles en plus du "cache: no-store" déjà forcé dans le client
// Supabase admin (voir src/lib/supabase/admin.ts) : garantit qu'aucune
// couche de cache Next.js ne serve un instantané périmé de la liste des
// tâches sur cette page.
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
  searchParams: { dueAtMost?: string; overdue?: string };
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const supabase = createAdminClient();
  const [tasks, allTags] = await Promise.all([getTasks(supabase, profile.id), getTags(supabase)]);

  return (
    <div className="min-h-screen bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-28 pt-1">
        <TaskFilterList
          tasks={tasks}
          allTags={allTags}
          currentUserId={profile.id}
          initialDueAtMost={searchParams.dueAtMost}
          initialOverdueOnly={searchParams.overdue === "1"}
        />
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

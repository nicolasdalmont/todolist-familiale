import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTasks } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { HomeDashboard } from "@/components/HomeDashboard";
import { IconPlus } from "@/components/Icons";

// Voir la note dans src/app/tasks/page.tsx (et supabase/admin.ts) sur les
// pièges de cache Next.js déjà rencontrés sur ce projet — même précaution
// ici, cet écran affiche lui aussi des données qui doivent rester à jour.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const supabase = createAdminClient();
  // getTasks ne renvoie que les tâches visibles par profile.id (créées par
  // lui, ou partagées avec lui) — voir src/lib/access.ts.
  const tasks = await getTasks(supabase, profile.id);

  return (
    <div className="min-h-screen bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-28 pt-1">
        <HomeDashboard profile={profile} tasks={tasks} />
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

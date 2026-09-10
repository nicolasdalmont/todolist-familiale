import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppSettings, getCategories, getMembers, getUserStats } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { AdminScreen } from "@/components/AdminScreen";
import { IconUsers } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Écran réservé au compte administrateur — accès direct par l'URL
// (contournant le lien de la Topbar, masqué pour les autres comptes) traité
// comme une page inexistante plutôt qu'une redirection, pour ne rien
// révéler de son contenu. Même logique que /tasks/[id]/edit pour un
// utilisateur sans canEdit — voir src/lib/access.ts. Deux onglets :
// « Membres » (gestion des comptes) et « Activité » (statistiques) — voir
// 6.9.
export default async function AdminPage() {
  const profile = await requireUser();
  if (profile.role !== "admin") notFound();

  const supabase = createAdminClient();
  const [members, categories, settings, stats] = await Promise.all([
    getMembers(supabase),
    getCategories(supabase),
    getAppSettings(supabase),
    getUserStats(supabase),
  ]);

  return (
    <div className="min-h-dvh bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-1 sm:pb-16">
        <div className="mb-4 mt-1.5 flex items-center gap-2">
          <IconUsers className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-extrabold">Administration</h2>
        </div>

        <AdminScreen
          currentUserId={profile.id}
          members={members}
          categories={categories}
          settings={settings}
          stats={stats}
        />
      </main>
    </div>
  );
}

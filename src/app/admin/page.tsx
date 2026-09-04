import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserStats } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { IconBarChart } from "@/components/Icons";
import { formatDate, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// Écran réservé au compte administrateur — accès direct par l'URL
// (contournant le lien de la Topbar, masqué pour les autres comptes) traité
// comme une page inexistante plutôt qu'une redirection, pour ne rien
// révéler de son contenu. Même logique que /tasks/[id]/edit pour un
// utilisateur sans canEdit — voir src/lib/access.ts.
export default async function AdminStatsPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") notFound();

  const supabase = createAdminClient();
  const stats = await getUserStats(supabase);

  return (
    <div className="min-h-screen bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-1">
        <div className="mb-4 mt-1.5 flex items-center gap-2">
          <IconBarChart className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-extrabold">Statistiques</h2>
        </div>

        <div className="flex flex-col gap-2.5">
          {stats.map((u) => (
            <div key={u.id} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar profile={u} />
                  <div className="text-[15px] font-bold">{u.name}</div>
                </div>
                <div className="text-right text-[11.5px] leading-tight text-ink-muted">
                  <div className="text-[10px] uppercase tracking-wide">Dernière activité</div>
                  <div className="font-semibold text-ink">
                    {u.lastSeenAt ? relativeTime(u.lastSeenAt) : "Jamais vu"}
                  </div>
                  {u.lastSeenAt ? <div>{formatDate(u.lastSeenAt)}</div> : null}
                </div>
              </div>

              {/* 4 compteurs, ventilés privé/partagé x total/7 derniers
                  jours (sur demande explicite de l'utilisateur) — jamais le
                  contenu des tâches, uniquement des comptages (voir
                  getUserStats() dans src/lib/queries.ts). */}
              <table className="mt-3 w-full border-t border-line-soft pt-3 text-center [&_td]:pt-2 [&_th]:pt-3">
                <thead>
                  <tr>
                    <th className="w-[38%]" />
                    <th className="text-[11.5px] font-semibold text-ink-muted">Privées</th>
                    <th className="text-[11.5px] font-semibold text-ink-muted">Partagées</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="text-left text-[12px] font-semibold text-ink-muted">Total</td>
                    <td className="text-[19px] font-extrabold text-brand">{u.totalPrivate}</td>
                    <td className="text-[19px] font-extrabold text-brand">{u.totalShared}</td>
                  </tr>
                  <tr>
                    <td className="text-left text-[12px] font-semibold text-ink-muted">7 derniers jours</td>
                    <td className="text-[19px] font-extrabold text-brand">{u.weekPrivate}</td>
                    <td className="text-[19px] font-extrabold text-brand">{u.weekShared}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

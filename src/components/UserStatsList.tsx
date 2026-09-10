import type { UserStats } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Time } from "./Time";

// Onglet « Activité » de l'écran admin (voir AdminScreen.tsx et 6.9) :
// pour chaque membre, sa dernière activité et 4 compteurs de tâches
// créées (privé/partagé × total/7 derniers jours). Jamais le contenu des
// tâches, uniquement des comptages — voir getUserStats() dans
// src/lib/queries.ts.
export function UserStatsList({ stats }: { stats: UserStats[] }) {
  return (
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
                {u.lastSeenAt ? <Time iso={u.lastSeenAt} relative /> : "Jamais vu"}
              </div>
              {u.lastSeenAt ? <Time iso={u.lastSeenAt} className="block" /> : null}
            </div>
          </div>

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
  );
}

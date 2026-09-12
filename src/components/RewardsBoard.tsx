import type { RewardAchievement } from "@/lib/types";
import { RewardStatusBadge } from "./Badge";
import { IconGift, IconUsers } from "./Icons";

// Paliers de récompense atteints (src/lib/rewards.ts, migration 002) —
// affichés sur l'Accueil : les paliers collectifs (toute la famille) et
// ceux de l'utilisateur courant (le filtrage entre les deux est déjà fait
// côté serveur, voir src/app/page.tsx). Purement présentationnel, même
// principe que ChallengeCard.tsx. N'affiche rien si la liste est vide —
// pas de coquille "aucun palier" à faire disparaître ensuite, même logique
// que StreakBadge dans Badge.tsx.
export function RewardsBoard({ achievements }: { achievements: RewardAchievement[] }) {
  if (achievements.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
          <IconGift className="h-3.5 w-3.5" />
        </span>
        <p className="text-[13.5px] font-bold text-ink">Paliers atteints</p>
      </div>

      <div className="flex flex-col gap-2">
        {achievements.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-2 border-t border-line-soft pt-2 first:border-t-0 first:pt-0">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-ink">{a.tier.rewardLabel}</p>
              <p className="flex items-center gap-1 text-[11.5px] text-ink-muted">
                {a.user ? (
                  a.user.name
                ) : (
                  <>
                    <IconUsers className="h-3 w-3" /> Toute la famille
                  </>
                )}
              </p>
            </div>
            <RewardStatusBadge status={a.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

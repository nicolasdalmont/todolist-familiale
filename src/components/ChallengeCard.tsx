import type { ChallengeProgress, WeeklyChallenge } from "@/lib/types";
import { IconGift } from "./Icons";

// Carte "Défi de la semaine" sur l'écran d'accueil (src/components/
// HomeDashboard.tsx) — premier lot de gamification, défis familiaux
// hebdomadaires calculés côté serveur (voir src/lib/challenges.ts et
// src/app/page.tsx). Purement présentationnelle : la progression arrive
// déjà calculée, ce composant ne fait qu'afficher.

function daysLeftLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 12));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  if (daysLeft <= 0) return "Dernier jour";
  return daysLeft === 1 ? "Dernier jour" : `${daysLeft} jours restants`;
}

function ProgressBar({ progress }: { progress: ChallengeProgress }) {
  // target=0 (métrique "atMost" du type "0 changement") : rien à
  // remplir, la barre reste vide tant que success est vrai.
  const ratio = progress.target > 0 ? Math.min(1, progress.current / progress.target) : progress.success ? 1 : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-soft">
      <div
        className={`h-full rounded-full transition-all ${progress.success ? "bg-green-500" : "bg-brand"}`}
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}

export function ChallengeCard({
  challenge,
  progress,
}: {
  challenge: WeeklyChallenge;
  progress: ChallengeProgress;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
          <IconGift className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold text-ink">{challenge.title}</p>
          <p className="text-[12.5px] leading-snug text-ink-muted">{challenge.description}</p>
        </div>
        <span className="flex-shrink-0 pt-0.5 text-[11px] font-semibold text-ink-muted">
          {progress.success ? "Réussi ✅" : daysLeftLabel(challenge.weekStart)}
        </span>
      </div>

      {progress.parts ? (
        <div className="flex flex-col gap-1.5">
          {progress.parts.map((part, i) => (
            <div key={i} className="flex items-center gap-2">
              <ProgressBar progress={part} />
              <span className="flex-shrink-0 text-[11.5px] font-semibold text-ink-muted">{part.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <ProgressBar progress={progress} />
          <span className="flex-shrink-0 text-[11.5px] font-semibold text-ink-muted">{progress.label}</span>
        </div>
      )}
    </div>
  );
}

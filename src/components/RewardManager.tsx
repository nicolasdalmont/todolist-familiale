"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { RewardAchievement, RewardTier } from "@/lib/types";
import { createRewardTierAction, setRewardAchievementStatusAction, toggleRewardTierActiveAction } from "@/lib/reward-actions";
import { useToast } from "@/components/Toast";
import { RewardStatusBadge } from "./Badge";
import { Time } from "./Time";
import { IconGift, IconPlus, IconUsers } from "./Icons";

// Onglet « Récompenses » de l'écran admin (voir AdminScreen.tsx et
// src/lib/rewards.ts, migration 002) : configurer les paliers (seuil +
// récompense en texte libre) et déclarer une récompense donnée une fois
// négociée en famille, hors appli. Même moule que CategoryManager.tsx /
// UserManager.tsx.

type Kind = "individual_streak" | "collective_challenges";

function kindLabel(t: Pick<RewardTier, "scope" | "metric">): string {
  return t.scope === "individual" ? "Streak personnel" : "Défis familiaux";
}

function tierSummary(t: RewardTier): string {
  return t.scope === "individual" ? `${t.threshold} jours de streak` : `${t.threshold} défis réussis`;
}

export function RewardManager({ tiers, achievements }: { tiers: RewardTier[]; achievements: RewardAchievement[] }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [showCreate, setShowCreate] = useState(false);
  const [kind, setKind] = useState<Kind>("individual_streak");
  const [threshold, setThreshold] = useState("7");
  const [rewardLabel, setRewardLabel] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  function run(action: () => Promise<{ error?: string }>, okMessage: string, onOk?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      onOk?.();
      toast.show({ message: okMessage, tone: "success" });
      router.refresh();
    });
  }

  function openCreate() {
    setKind("individual_streak");
    setThreshold("7");
    setRewardLabel("");
    setCreateError(null);
    setShowCreate(true);
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("threshold", threshold);
    fd.set("rewardLabel", rewardLabel);
    startTransition(async () => {
      const res = await createRewardTierAction(fd);
      if (res.error) {
        setCreateError(res.error);
        return;
      }
      setShowCreate(false);
      toast.show({ message: "Palier créé", tone: "success" });
      router.refresh();
    });
  }

  const pending = achievements.filter((a) => a.status === "pending");
  const given = achievements.filter((a) => a.status === "given");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] text-ink-muted">
            {tiers.length} palier{tiers.length > 1 ? "s" : ""} configuré{tiers.length > 1 ? "s" : ""}
          </p>
          {!showCreate ? (
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-bold text-white"
            >
              <IconPlus className="h-3.5 w-3.5" /> Ajouter un palier
            </button>
          ) : null}
        </div>

        {showCreate ? (
          <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div>
              <label className="mb-1 block text-[12.5px] font-bold" htmlFor="rewardKind">
                Type de palier
              </label>
              <select
                id="rewardKind"
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-brand"
              >
                <option value="individual_streak">Individuel — streak personnel (jours actifs)</option>
                <option value="collective_challenges">Collectif — défis familiaux réussis cumulés</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12.5px] font-bold" htmlFor="rewardThreshold">
                Seuil
              </label>
              <input
                id="rewardThreshold"
                type="number"
                min={1}
                required
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12.5px] font-bold" htmlFor="rewardLabel">
                Récompense
              </label>
              <input
                id="rewardLabel"
                type="text"
                required
                autoFocus
                value={rewardLabel}
                onChange={(e) => setRewardLabel(e.target.value)}
                placeholder="Ex : sortie ciné, 5€ d'argent de poche…"
                className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-brand"
              />
            </div>
            {createError ? <p className="text-[12.5px] font-semibold text-red-600">{createError}</p> : null}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 rounded-xl bg-brand py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
              >
                {isPending ? "Création…" : "Créer le palier"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-line bg-surface px-4 py-2.5 text-[13.5px] font-bold text-ink-muted"
              >
                Annuler
              </button>
            </div>
          </form>
        ) : null}

        <div className="flex flex-col gap-2">
          {tiers.map((t) => (
            <div key={t.id} className={`rounded-2xl border border-line bg-surface p-3.5 shadow-sm ${!t.active ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
                    {t.scope === "individual" ? <IconGift className="h-4 w-4" /> : <IconUsers className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="text-[13.5px] font-bold text-ink">{tierSummary(t)}</p>
                    <p className="text-[12px] text-ink-muted">
                      {kindLabel(t)} · {t.rewardLabel}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => toggleRewardTierActiveAction(t.id), t.active ? "Palier désactivé" : "Palier réactivé")}
                  className="shrink-0 text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
                >
                  {t.active ? "Désactiver" : "Réactiver"}
                </button>
              </div>
            </div>
          ))}
          {tiers.length === 0 && !showCreate ? (
            <p className="rounded-2xl border border-dashed border-line p-4 text-center text-[13px] text-ink-muted">
              Aucun palier configuré pour l&apos;instant.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-bold text-ink">
          Paliers atteints {pending.length > 0 ? `(${pending.length} en attente)` : ""}
        </p>

        {achievements.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-4 text-center text-[13px] text-ink-muted">
            Personne n&apos;a encore atteint de palier.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...pending, ...given].map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold text-ink">{a.tier.rewardLabel}</p>
                  <p className="text-[12px] text-ink-muted">
                    {a.user ? a.user.name : "Toute la famille"} · <Time iso={a.achievedAt} />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <RewardStatusBadge status={a.status} />
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => setRewardAchievementStatusAction(a.id, a.status === "given" ? "pending" : "given"),
                        a.status === "given" ? "Remis en attente" : "Marqué comme donné"
                      )
                    }
                    className="text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
                  >
                    {a.status === "given" ? "Annuler" : "Marquer donné"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

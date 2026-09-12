"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import type { RewardMetric, RewardScope, RewardStatus } from "@/lib/types";

// Gestion des paliers de récompense, réservée au rôle admin (onglet
// « Récompenses » de l'écran /admin — voir src/components/RewardManager.tsx
// et la migration 002). Créer/désactiver un palier, marquer une récompense
// atteinte comme donnée. Même moule que src/lib/admin-actions.ts et
// src/lib/category-actions.ts.

type Result = { error?: string; ok?: boolean };

// Un seul choix côté formulaire plutôt que scope + metric séparés : les
// deux combinaisons valides sont figées par le produit (streak personnel ⇔
// individuel, défis réussis ⇔ collectif), pas la peine d'exposer une
// matrice où la moitié des cases n'a pas de sens.
const KIND_TO_SCOPE_METRIC: Record<string, { scope: RewardScope; metric: RewardMetric }> = {
  individual_streak: { scope: "individual", metric: "streak_days" },
  collective_challenges: { scope: "collective", metric: "challenges_completed" },
};

function tableMissing(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "42P01";
}
const MIGRATION_MISSING = "Applique d'abord la migration 002_reward_tiers.sql sur Neon.";

function revalidate() {
  // Les paliers/récompenses s'affichent sur l'Accueil (tous) et l'admin.
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function createRewardTierAction(formData: FormData): Promise<Result> {
  await requireAdmin();

  const kind = KIND_TO_SCOPE_METRIC[String(formData.get("kind") ?? "")];
  if (!kind) return { error: "Type de palier invalide." };

  const threshold = Number(formData.get("threshold"));
  if (!Number.isInteger(threshold) || threshold <= 0) return { error: "Le seuil doit être un nombre entier positif." };

  const rewardLabel = String(formData.get("rewardLabel") ?? "").trim();
  if (!rewardLabel) return { error: "Indique la récompense associée à ce palier." };
  if (rewardLabel.length > 200) return { error: "Ce libellé est trop long." };

  try {
    await sql`
      insert into reward_tiers (scope, metric, threshold, reward_label)
      values (${kind.scope}, ${kind.metric}, ${threshold}, ${rewardLabel})
    `;
  } catch (e) {
    if (tableMissing(e)) return { error: MIGRATION_MISSING };
    return { error: "Impossible de créer ce palier. Réessaie." };
  }

  revalidate();
  return { ok: true };
}

export async function toggleRewardTierActiveAction(tierId: string): Promise<Result> {
  await requireAdmin();
  if (!tierId) return { error: "Palier introuvable." };

  try {
    await sql`update reward_tiers set active = not active where id = ${tierId}`;
  } catch (e) {
    if (tableMissing(e)) return { error: MIGRATION_MISSING };
    return { error: "Impossible de mettre à jour ce palier. Réessaie." };
  }

  revalidate();
  return { ok: true };
}

export async function setRewardAchievementStatusAction(achievementId: string, status: RewardStatus): Promise<Result> {
  const { me } = await requireAdmin();
  if (!achievementId) return { error: "Récompense introuvable." };

  try {
    if (status === "given") {
      await sql`
        update reward_achievements set status = 'given', given_at = now(), given_by = ${me.id}
        where id = ${achievementId}
      `;
    } else {
      await sql`
        update reward_achievements set status = 'pending', given_at = null, given_by = null
        where id = ${achievementId}
      `;
    }
  } catch (e) {
    if (tableMissing(e)) return { error: MIGRATION_MISSING };
    return { error: "Impossible de mettre à jour cette récompense. Réessaie." };
  }

  revalidate();
  return { ok: true };
}

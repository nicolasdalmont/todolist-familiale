import { addDaysToKey, dateKeyFromDate } from "./format";
import { parisWallTimeToUtcIso } from "./timezone";
import { WEEKLY_CHALLENGES, challengeNeedsMembers, evaluateChallenge } from "./challenges";
import { notifyUser } from "./notifications";
import {
  countSuccessfulChallenges,
  getActiveRewardTiers,
  getFamilyWeekActivity,
  getProfiles,
  getSettledChallengeWeekStarts,
  getSharedTasksSnapshot,
  insertChallengeResult,
  insertRewardAchievementIfAbsent,
} from "./queries";
import type { Profile, RewardTier } from "./types";

// Paliers de récompense (migration 002) : orchestre le calcul et la
// persistance des paliers atteints, individuels (streak) et collectifs
// (défis familiaux réussis cumulés) — voir le plan produit dans la
// conversation du 12/09/2026 (mémoire `gamification-test-phase`). Les
// tiers eux-mêmes (seuil, libellé de récompense) sont configurés par
// l'admin dans l'onglet « Récompenses » (src/components/RewardManager.tsx) ;
// ce fichier ne fait que constater qu'un seuil est franchi et l'enregistrer,
// une fois, dans `reward_achievements`.

// Fige le résultat des semaines de défi déjà terminées et pas encore
// enregistrées dans `challenge_results` — nécessaire pour compter les défis
// réussis cumulés (palier collectif) sans recalculer indéfiniment le passé.
//
// Limitation assumée : `getSharedTasksSnapshot()` reflète l'état *actuel*
// des tâches, pas leur état à la fin de la semaine passée (une tâche
// partagée rouverte depuis fausserait rétroactivement la métrique "0 tâche
// en retard"). Acceptable car l'Accueil est visité quotidiennement par la
// famille : une semaine est réglée dans les heures qui suivent sa fin, pas
// des mois après.
export async function settleEndedChallengeWeeks(): Promise<void> {
  const todayKey = dateKeyFromDate(new Date());
  const alreadySettled = await getSettledChallengeWeekStarts();

  const ended = WEEKLY_CHALLENGES.filter((c) => addDaysToKey(c.weekStart, 6) < todayKey && !alreadySettled.has(c.weekStart));
  if (ended.length === 0) return;

  for (const challenge of ended) {
    const weekStartIso = parisWallTimeToUtcIso(`${challenge.weekStart}T00:00`);
    const weekEndIso = parisWallTimeToUtcIso(`${addDaysToKey(challenge.weekStart, 7)}T00:00`);
    const [familyActivity, sharedTasks, members] = await Promise.all([
      getFamilyWeekActivity(weekStartIso, weekEndIso),
      getSharedTasksSnapshot(),
      challengeNeedsMembers(challenge) ? getProfiles() : Promise.resolve([]),
    ]);
    const progress = evaluateChallenge(challenge, { activity: familyActivity, sharedTasks, members });
    await insertChallengeResult(challenge.weekStart, progress.success);
  }
}

// Libellé du palier pour le corps de la notification (voir
// notifyRewardReached ci-dessous) — même info que tierSummary() dans
// src/components/RewardManager.tsx, texte différent (contexte notification
// plutôt que fiche admin).
function describeTier(tier: RewardTier): string {
  return tier.scope === "individual" ? `Streak de ${tier.threshold} jours` : `${tier.threshold} défis familiaux réussis`;
}

// Prévient TOUTE la famille (in-app + push, voir notifyUser()) qu'un
// palier vient d'être atteint pour la première fois — appelé uniquement
// quand insertRewardAchievementIfAbsent() renvoie `true`, donc une seule
// fois par palier. `achieverName` : `null` pour un palier collectif (pas
// de personne en particulier), sinon la personne à l'origine du palier
// individuel — elle est notifiée comme les autres, la formulation reste à
// la troisième personne pour rester la même pour tout le monde.
async function notifyRewardReached(tier: RewardTier, achieverName: string | null): Promise<void> {
  const members = await getProfiles();
  const title = achieverName ? `${achieverName} a atteint un palier !` : "La famille a atteint un palier !";
  const body = `${describeTier(tier)} → ${tier.rewardLabel}`;
  await Promise.all(members.map((m) => notifyUser({ userId: m.id, type: "reward_achieved", title, body })));
}

// Paliers collectifs : nombre de défis réussis cumulés (toute la famille,
// `user_id` null dans reward_achievements).
async function settleCollectiveAchievements(): Promise<void> {
  const [tiers, count] = await Promise.all([getActiveRewardTiers(), countSuccessfulChallenges()]);
  const collectiveTiers = tiers.filter((t) => t.scope === "collective" && t.metric === "challenges_completed" && t.threshold <= count);
  await Promise.all(
    collectiveTiers.map(async (t) => {
      const created = await insertRewardAchievementIfAbsent(t.id, null);
      if (created) await notifyRewardReached(t, null);
    })
  );
}

// Paliers individuels : streak personnel de `profile`, déjà calculé par
// l'appelant (Accueil) — pas de requête dupliquée ici.
async function settleIndividualAchievements(profile: Pick<Profile, "id" | "name">, streak: number): Promise<void> {
  const tiers = await getActiveRewardTiers();
  const individualTiers = tiers.filter((t) => t.scope === "individual" && t.metric === "streak_days" && t.threshold <= streak);
  await Promise.all(
    individualTiers.map(async (t) => {
      const created = await insertRewardAchievementIfAbsent(t.id, profile.id);
      if (created) await notifyRewardReached(t, profile.name);
    })
  );
}

// Point d'entrée unique, appelé depuis src/app/page.tsx à chaque visite de
// l'Accueil — contrairement au défi de la semaine (qui ne se calcule que
// dans les 9 semaines couvertes), doit tourner inconditionnellement : une
// semaine peut se terminer même hors de cette période, et le streak est
// recalculé tous les jours de toute façon.
export async function settleRewards(profile: Pick<Profile, "id" | "name">, streak: number): Promise<void> {
  await settleEndedChallengeWeeks();
  await Promise.all([settleCollectiveAchievements(), settleIndividualAchievements(profile, streak)]);
}

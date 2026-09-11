import { dateKeyFromDate, dateKeyFromIso, isOverdue, STATUS_LABELS } from "./format";
import type { ActivityLogEntry, ChallengeMetric, ChallengeProgress, Profile, TaskStatus, WeeklyChallenge } from "./types";

// Contenu et moteur des défis familiaux hebdomadaires — voir la carte
// ChallengeCard.tsx sur l'Accueil. Défis fixes, rédigés à l'avance (pas de
// génération dynamique) : chacun porte une semaine (lundi-dimanche, jour
// civil à Paris) et une métrique, calculée à partir des tâches partagées
// et du journal d'activité — jamais des tâches privées.

type SharedTaskSnapshot = { id: string; due_at: string | null; status: TaskStatus };

export interface ChallengeWeekData {
  activity: ActivityLogEntry[];
  sharedTasks: SharedTaskSnapshot[];
  members: Profile[];
}

function keyToNoonUtc(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function addDaysToKey(key: string, days: number): string {
  const noon = keyToNoonUtc(key);
  noon.setUTCDate(noon.getUTCDate() + days);
  return dateKeyFromDate(noon);
}

// 9 semaines, du 14 septembre au 15 novembre 2026 — toutes centrées sur
// les tâches partagées, pour la famille entière (pas de variante par
// membre). Les streaks individuels sont un lot séparé.
export const WEEKLY_CHALLENGES: WeeklyChallenge[] = [
  {
    weekStart: "2026-09-14",
    title: "Rentrée sereine",
    description: "Compléter 10 tâches partagées dans la semaine.",
    metric: { kind: "activity_count", activityType: "status_changed", target: 10, direction: "atLeast", dedupeByTaskId: true, matchDetail: STATUS_LABELS.done },
  },
  {
    weekStart: "2026-09-21",
    title: "Zéro retard",
    description: "Aucune tâche partagée en retard cette semaine.",
    metric: { kind: "zero_overdue_shared" },
  },
  {
    weekStart: "2026-09-28",
    title: "Équipe complète",
    description: "Chaque membre du foyer complète au moins une tâche partagée, chaque jour de la semaine.",
    metric: { kind: "full_team_daily_completion", target: 7 },
  },
  {
    weekStart: "2026-10-05",
    title: "On papote",
    description: "Ajouter au moins 5 commentaires sur des tâches partagées.",
    metric: { kind: "activity_count", activityType: "comment_added", target: 5, direction: "atLeast" },
  },
  {
    weekStart: "2026-10-12",
    title: "Créateurs actifs",
    description: "Créer au moins une tâche partagée chaque jour de la semaine.",
    metric: { kind: "distinct_active_days", activityType: "task_created", target: 7 },
  },
  {
    weekStart: "2026-10-19",
    title: "Grand ménage",
    description: "Compléter 15 tâches partagées, toutes catégories confondues.",
    metric: { kind: "activity_count", activityType: "status_changed", target: 15, direction: "atLeast", dedupeByTaskId: true, matchDetail: STATUS_LABELS.done },
  },
  {
    weekStart: "2026-10-26",
    title: "Check-list en béton",
    description: "Cocher au moins 10 éléments de checklist sur des tâches partagées.",
    metric: { kind: "activity_count", activityType: "checklist_item_checked", target: 10, direction: "atLeast" },
  },
  {
    weekStart: "2026-11-02",
    title: "Sans dernière minute",
    description: "Ne changer l'échéance d'aucune tâche partagée cette semaine.",
    metric: { kind: "activity_count", activityType: "due_date_changed", target: 0, direction: "atMost" },
  },
  {
    weekStart: "2026-11-09",
    title: "Le combo final",
    description: "20 tâches partagées complétées et aucun retard sur la semaine.",
    metric: {
      kind: "combo",
      metrics: [
        { kind: "activity_count", activityType: "status_changed", target: 20, direction: "atLeast", dedupeByTaskId: true, matchDetail: STATUS_LABELS.done },
        { kind: "zero_overdue_shared" },
      ],
    },
  },
];

// Défi actif pour la clé de date civile (Paris) `todayKey` — `null` hors
// des 9 semaines couvertes (avant le 14/09, après le 15/11). Les semaines
// de WEEKLY_CHALLENGES sont contiguës, donc une seule comparaison de
// bornes par entrée suffit, pas besoin de stocker une date de fin.
export function getCurrentChallenge(todayKey: string): WeeklyChallenge | null {
  for (const challenge of WEEKLY_CHALLENGES) {
    const weekEnd = addDaysToKey(challenge.weekStart, 6);
    if (todayKey >= challenge.weekStart && todayKey <= weekEnd) return challenge;
  }
  return null;
}

function progressFor(current: number, target: number, direction: "atLeast" | "atMost"): ChallengeProgress {
  const success = direction === "atLeast" ? current >= target : current <= target;
  const label = direction === "atLeast" ? `${current}/${target}` : `${current} (objectif : ≤ ${target})`;
  return { current, target, direction, success, label };
}

function evalActivityCount(metric: Extract<ChallengeMetric, { kind: "activity_count" }>, activity: ActivityLogEntry[]): ChallengeProgress {
  let rows = activity.filter((a) => a.type === metric.activityType);
  if (metric.matchDetail !== undefined) rows = rows.filter((a) => a.detail === metric.matchDetail);
  const current = metric.dedupeByTaskId ? new Set(rows.map((r) => r.task_id)).size : rows.length;
  return progressFor(current, metric.target, metric.direction);
}

function evalDistinctActiveDays(metric: Extract<ChallengeMetric, { kind: "distinct_active_days" }>, activity: ActivityLogEntry[]): ChallengeProgress {
  const days = new Set(activity.filter((a) => a.type === metric.activityType).map((a) => dateKeyFromIso(a.created_at)));
  return progressFor(days.size, metric.target, "atLeast");
}

function evalZeroOverdueShared(sharedTasks: SharedTaskSnapshot[]): ChallengeProgress {
  const overdueCount = sharedTasks.filter((t) => isOverdue(t.due_at, t.status)).length;
  return progressFor(overdueCount, 0, "atMost");
}

function evalFullTeamDailyCompletion(
  challenge: WeeklyChallenge,
  metric: Extract<ChallengeMetric, { kind: "full_team_daily_completion" }>,
  data: ChallengeWeekData
): ChallengeProgress {
  const doneDayActors = new Map<string, Set<string>>();
  for (const a of data.activity) {
    if (a.type !== "status_changed" || a.detail !== STATUS_LABELS.done) continue;
    const day = dateKeyFromIso(a.created_at);
    if (!doneDayActors.has(day)) doneDayActors.set(day, new Set());
    doneDayActors.get(day)!.add(a.actor_id);
  }

  const memberIds = data.members.map((m) => m.id);
  const todayKey = dateKeyFromDate(new Date());
  let current = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDaysToKey(challenge.weekStart, i);
    if (day > todayKey) break; // jour pas encore écoulé : ne compte ni pour ni contre
    const actors = doneDayActors.get(day);
    if (actors && memberIds.every((id) => actors.has(id))) current++;
  }
  return progressFor(current, metric.target, "atLeast");
}

export function evaluateMetric(challenge: WeeklyChallenge, metric: ChallengeMetric, data: ChallengeWeekData): ChallengeProgress {
  switch (metric.kind) {
    case "activity_count":
      return evalActivityCount(metric, data.activity);
    case "distinct_active_days":
      return evalDistinctActiveDays(metric, data.activity);
    case "zero_overdue_shared":
      return evalZeroOverdueShared(data.sharedTasks);
    case "full_team_daily_completion":
      return evalFullTeamDailyCompletion(challenge, metric, data);
    case "combo": {
      const parts = metric.metrics.map((m) => evaluateMetric(challenge, m, data));
      const successCount = parts.filter((p) => p.success).length;
      return {
        current: successCount,
        target: parts.length,
        direction: "atLeast",
        success: successCount === parts.length,
        label: `${successCount}/${parts.length} objectifs`,
        parts,
      };
    }
  }
}

export function evaluateChallenge(challenge: WeeklyChallenge, data: ChallengeWeekData): ChallengeProgress {
  return evaluateMetric(challenge, challenge.metric, data);
}

// Un défi a besoin de la liste des membres du foyer uniquement pour la
// métrique "full_team_daily_completion" — évite de charger getProfiles()
// pour rien les autres semaines (voir src/app/page.tsx).
export function challengeNeedsMembers(challenge: WeeklyChallenge): boolean {
  return challenge.metric.kind === "full_team_daily_completion";
}

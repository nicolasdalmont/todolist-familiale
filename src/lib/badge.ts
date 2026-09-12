// Nombre d'éléments distincts nécessitant l'attention de l'utilisateur, pour
// la pastille de l'icône de l'appli (App Badging API) — utilisé à la fois
// côté serveur (getBadgeCount() dans src/lib/queries.ts, pour le badge
// envoyé avec un push, voir src/lib/push.ts) et côté client
// (HomeDashboard.tsx, pour la mise à jour immédiate sans push), qui doivent
// renvoyer le même chiffre.
//
// Une tâche à la fois en retard et sujette à une notification non lue liée
// à cette même tâche (typiquement le rappel "due_soon" du jour, une fois
// l'heure d'échéance dépassée dans la journée) ne doit compter qu'une seule
// fois : les deux sources se recoupent par id de tâche plutôt que de
// s'additionner. Une notification sans tâche associée (ex. palier de
// récompense, voir src/lib/rewards.ts) compte pour elle-même.
export function computeBadgeCount(
  overdueTaskIds: string[],
  notifications: Array<{ id: string; task_id: string | null }>
): number {
  const keys = new Set<string>();
  for (const id of overdueTaskIds) keys.add(`task:${id}`);
  for (const n of notifications) keys.add(n.task_id ? `task:${n.task_id}` : `notif:${n.id}`);
  return keys.size;
}

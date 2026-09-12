import { addDaysToKey, dateKeyFromDate, dayKeyToNoonUtc, mondayOfWeek } from "./format";

// Streak personnel — voir src/components/Badge.tsx (StreakBadge) et
// getUserActiveDays() dans src/lib/queries.ts pour la donnée source.
// Fonction pure, sans DB, sur le même principe que src/lib/challenges.ts :
// la donnée brute (jours actifs) est chargée côté serveur, le calcul se
// fait ici.

// Borne de sécurité sur le nombre de jours parcourus en arrière — évite
// une boucle infinie et plafonne le streak affichable. Largement
// suffisant tant que la fonctionnalité est récente (personne ne peut
// avoir un streak plus vieux qu'elle) ; à revoir si jamais atteint en
// pratique.
const MAX_LOOKBACK_DAYS = 400;

// `activeDays` : clés "YYYY-MM-DD" (jour civil Paris) où l'utilisateur a
// fait au moins une action qualifiante (voir logUserActivity() dans
// src/lib/actions.ts). `todayKey` : jour civil courant, même format.
//
// Parcourt les jours en arrière depuis aujourd'hui. Le tout premier jour
// examiné (aujourd'hui) n'est jamais compté comme un échec s'il est
// inactif — la journée n'est simplement pas terminée. Chaque jour
// suivant : actif → +1 ; inactif → consomme la grâce de sa semaine civile
// (lundi-dimanche) si elle n'a pas déjà servi, sinon le streak s'arrête
// et la fonction renvoie le compte accumulé jusque-là.
//
// Conséquence acceptée de la grâce "par semaine civile" plutôt que par
// fenêtre glissante : un trou à cheval sur une frontière de semaine
// (dimanche + lundi suivant) peut être pardonné deux fois de suite — 1
// jour de grâce par semaine, au sens littéral.
export function computeStreak(activeDaysInput: Set<string> | string[], todayKey: string): number {
  const activeDays = activeDaysInput instanceof Set ? activeDaysInput : new Set(activeDaysInput);
  const graceUsedByWeek = new Set<string>();

  let current = 0;
  let cursor = todayKey;
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    if (activeDays.has(cursor)) {
      current++;
    } else if (i > 0) {
      const weekKey = dateKeyFromDate(mondayOfWeek(dayKeyToNoonUtc(cursor)));
      if (graceUsedByWeek.has(weekKey)) break;
      graceUsedByWeek.add(weekKey);
    }
    cursor = addDaysToKey(cursor, -1);
  }
  return current;
}

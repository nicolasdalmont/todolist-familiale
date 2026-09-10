import type { Recurrence, TaskStatus } from "./types";
import { APP_TIMEZONE } from "./timezone";

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Année affichée seulement si elle diffère de l'année civile courante (à
// Paris) — sinon « 12 sept. » suffit ; « 12 sept. 2027 » lève l'ambiguïté
// pour une échéance lointaine ou une activité de l'an dernier (audit UX
// INC-6).
function sameYearAsNow(d: Date): boolean {
  const y = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric" }).format(x);
  return y(d) === y(new Date());
}

export function formatDate(iso: string | null): string {
  if (!iso) return "Sans échéance";
  const d = new Date(iso);
  // timeZone explicite : ces fonctions tournent aussi côté serveur (Vercel,
  // UTC) — voir src/lib/timezone.ts.
  return (
    d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      ...(sameYearAsNow(d) ? {} : { year: "numeric" }),
      timeZone: APP_TIMEZONE,
    }) +
    " · " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIMEZONE })
  );
}

// Date seule (sans l'heure), même règle d'année que formatDate — utilisée
// par relativeTime au-delà d'une semaine.
export function formatDateOnly(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    ...(sameYearAsNow(d) ? {} : { year: "numeric" }),
    timeZone: APP_TIMEZONE,
  });
}

// « à l'instant / n min / n h / hier / il y a n j » jusqu'à une semaine,
// puis une date absolue — au-delà, « 47 j » ne veut plus rien dire pour
// personne (audit UX INC-6). Passé/futur : on ne gère ici que le passé
// (commentaires, activité, notifications sont toujours dans le passé).
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < 0) return formatDateOnly(iso);
  if (diff < min) return "à l'instant";
  if (diff < hour) return Math.floor(diff / min) + " min";
  if (diff < day) return Math.floor(diff / hour) + " h";
  const days = Math.floor(diff / day);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;
  return formatDateOnly(iso);
}

export function isOverdue(dueAt: string | null, status: TaskStatus): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < Date.now() && status !== "done" && status !== "archived";
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminée",
  archived: "Archivée",
};

export function recurrenceLabel(recurrence: Recurrence | null | undefined): string {
  if (!recurrence || recurrence.type === "none") return "Ponctuelle";
  if (recurrence.type === "custom") {
    const unit = recurrence.unit === "weeks" ? "semaine(s)" : recurrence.unit === "months" ? "mois" : "jour(s)";
    return `Tous les ${recurrence.interval ?? 1} ${unit}`;
  }
  const labels: Record<string, string> = {
    daily: "Quotidienne",
    weekly: "Hebdomadaire",
    monthly: "Mensuelle",
  };
  return labels[recurrence.type] || "Ponctuelle";
}

// Calcule la prochaine échéance d'une tâche récurrente à sa clôture.
export function computeNextOccurrence(dueAt: string | null, recurrence: Recurrence): string | null {
  if (!dueAt) return null;
  const base = new Date(dueAt);
  const interval = recurrence.interval ?? 1;

  switch (recurrence.type) {
    case "daily":
      base.setDate(base.getDate() + interval);
      return base.toISOString();
    case "weekly":
      base.setDate(base.getDate() + interval * 7);
      return base.toISOString();
    case "monthly":
      base.setMonth(base.getMonth() + interval);
      return base.toISOString();
    case "custom": {
      if (recurrence.unit === "weeks") base.setDate(base.getDate() + interval * 7);
      else if (recurrence.unit === "months") base.setMonth(base.getMonth() + interval);
      else base.setDate(base.getDate() + interval);
      return base.toISOString();
    }
    default:
      return null;
  }
}

// Instant (ISO/UTC) → valeur "YYYY-MM-DDTHH:mm" attendue par un
// <input type="datetime-local">, exprimée en heure de Paris (voir
// src/lib/timezone.ts) quel que soit le fuseau du navigateur. La conversion
// retour (saisie → UTC) est faite par parisWallTimeToUtcIso() dans les
// Server Actions.
export function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// --- Clés de date "civile" (filtre "échéance", tuiles du tableau de bord) --
//
// Toujours calculées dans le fuseau Europe/Paris (voir src/lib/timezone.ts),
// que le code tourne côté serveur (Vercel, UTC) ou côté navigateur (dans
// n'importe quel fuseau) : "aujourd'hui" / "cette semaine" doivent désigner
// le jour civil de la famille, pas celui du serveur.

// Clé "YYYY-MM-DD" (jour civil à Paris) à partir d'une date ISO — sert à
// comparer une échéance à une date choisie sans se soucier de l'heure.
export function dateKeyFromIso(iso: string): string {
  return dateKeyFromDate(new Date(iso));
}

export function dateKeyFromDate(d: Date): string {
  // "en-CA" formate en "YYYY-MM-DD".
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Renvoie une date dont le jour civil (à Paris) est le dimanche de la
// semaine en cours — aujourd'hui inclus si on est déjà dimanche. Seule la
// clé de date (dateKeyFromDate) de la valeur renvoyée a du sens ; l'heure
// est fixée à midi UTC, neutre vis-à-vis du fuseau.
export function upcomingSunday(from: Date): Date {
  const [y, m, d] = dateKeyFromDate(from).split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  noon.setUTCDate(noon.getUTCDate() + ((7 - noon.getUTCDay()) % 7));
  return noon;
}

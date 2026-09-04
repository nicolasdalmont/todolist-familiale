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

export function formatDate(iso: string | null): string {
  if (!iso) return "Sans échéance";
  const d = new Date(iso);
  // timeZone explicite : ces fonctions tournent aussi côté serveur (Vercel,
  // UTC) — voir src/lib/timezone.ts.
  return (
    d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: APP_TIMEZONE }) +
    " · " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIMEZONE })
  );
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "à l'instant";
  if (diff < hour) return Math.floor(diff / min) + " min";
  if (diff < day) return Math.floor(diff / hour) + " h";
  return Math.floor(diff / day) + " j";
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

import type { Recurrence, TaskStatus } from "./types";

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
  return (
    d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) +
    " · " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
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

export function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// --- Clés de date locale (filtre "échéance", tuiles du tableau de bord) --
//
// Volontairement calculées côté client (voir HomeDashboard.tsx et
// TaskFilterList.tsx, tous deux "use client") plutôt que côté serveur :
// un Server Component s'exécute avec l'heure/le fuseau du serveur Vercel
// (UTC), qui ne correspond pas forcément au fuseau réel de la famille —
// calculer "aujourd'hui"/"cette semaine" côté navigateur évite un décalage
// d'un jour près de minuit, sur le même principe que isOverdue() déjà
// utilisé côté client dans TaskCard.

// Clé "YYYY-MM-DD" (fuseau local) à partir d'une date ISO — sert à comparer
// une échéance à une date choisie sans se soucier de l'heure exacte.
export function dateKeyFromIso(iso: string): string {
  return dateKeyFromDate(new Date(iso));
}

export function dateKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Renvoie la date (minuit local) du dimanche de la semaine en cours —
// aujourd'hui inclus si on est déjà dimanche.
export function upcomingSunday(from: Date): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const daysUntilSunday = (7 - d.getDay()) % 7; // getDay() : dimanche = 0
  d.setDate(d.getDate() + daysUntilSunday);
  return d;
}

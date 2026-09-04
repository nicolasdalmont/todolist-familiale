import type { Task } from "./types";

// Durée de l'événement créé à partir d'une tâche datée : un bloc d'une
// heure à partir de l'échéance.
const EVENT_DURATION_MS = 60 * 60 * 1000;

// "2026-09-10T14:00:00.000Z" -> "20260910T140000Z" (format attendu par le
// paramètre "dates" de Google Agenda).
function toGoogleDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Construit l'URL de création d'événement Google Agenda ("template URL") à
// partir d'une tâche. Google ouvre son formulaire pré-rempli (titre, dates,
// description) ; l'utilisateur choisit son agenda et enregistre. C'est une
// copie ponctuelle : une modification ultérieure de la tâche ne met pas
// l'événement à jour.
//
// L'échéance est stockée en UTC (`timestamptz`) et transmise en UTC (suffixe
// "Z") : Google la reconvertit dans le fuseau de l'agenda de l'utilisateur,
// aucun calcul de fuseau à faire ici.
//
// Renvoie `null` si la tâche n'a pas d'échéance : il n'y a alors rien à
// planifier et le bouton n'est pas affiché (voir src/app/tasks/[id]/page.tsx).
export function googleCalendarUrl(
  task: Pick<Task, "title" | "description" | "due_at">,
  taskUrl?: string
): string | null {
  if (!task.due_at) return null;

  const start = new Date(task.due_at);
  const end = new Date(start.getTime() + EVENT_DURATION_MS);

  const details = [task.description?.trim(), taskUrl ? `Tâche : ${taskUrl}` : null]
    .filter(Boolean)
    .join("\n\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: task.title,
    dates: `${toGoogleDate(start)}/${toGoogleDate(end)}`,
  });
  if (details) params.set("details", details);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

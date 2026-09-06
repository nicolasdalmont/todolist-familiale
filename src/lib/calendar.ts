import type { Task } from "./types";

// Génération d'un fichier iCalendar (`.ics`, RFC 5545) à partir d'une
// tâche datée. Servi par src/app/api/tasks/[id]/calendar/route.ts avec un
// en-tête `Content-Disposition: attachment` : l'appareil l'ouvre alors
// dans son **application de calendrier par défaut** (Apple Calendar sur
// iOS, l'agenda par défaut sur Android, Outlook/Apple Calendar sur
// desktop…), qui propose d'ajouter l'événement.
//
// Générique et indépendant de la plateforme, contrairement à l'ancien
// lien spécifique à Google Agenda qu'il remplace (04/09/2026). C'est une
// copie ponctuelle : une modification ultérieure de la tâche ne met pas
// l'événement à jour.

// Durée de l'événement : un bloc d'une heure à partir de l'échéance.
const EVENT_DURATION_MS = 60 * 60 * 1000;

// "2026-09-10T14:00:00.000Z" -> "20260910T140000Z". L'échéance est stockée
// en UTC (`timestamptz`) et transmise en UTC (suffixe "Z") : l'appli de
// calendrier la reconvertit dans le fuseau de l'appareil, aucun calcul de
// fuseau à faire ici.
function toICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Échappement des valeurs texte iCalendar (RFC 5545 §3.3.11).
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Renvoie le contenu complet d'un fichier `.ics` pour la tâche, ou `null`
// si elle n'a pas d'échéance (rien à planifier — le bouton n'est alors
// pas affiché, voir src/app/tasks/[id]/page.tsx).
export function buildTaskICS(
  task: Pick<Task, "id" | "title" | "description" | "due_at">,
  taskUrl?: string
): string | null {
  if (!task.due_at) return null;

  const start = new Date(task.due_at);
  const end = new Date(start.getTime() + EVENT_DURATION_MS);

  const description = [task.description?.trim(), taskUrl ? `Tâche : ${taskUrl}` : null]
    .filter(Boolean)
    .join("\n\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//To-Do List Familiale//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${task.id}@todolist-familiale`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${escapeICS(task.title)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeICS(description)}`);
  if (taskUrl) lines.push(`URL:${escapeICS(taskUrl)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  // Fins de ligne CRLF imposées par la RFC.
  return lines.join("\r\n") + "\r\n";
}

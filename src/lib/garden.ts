import { sql } from "./db";
import { notifyUser } from "./notifications";
import { computeVisibility } from "./access";
import { parisWallTimeToUtcIso } from "./timezone";
import { APP_TIMEZONE } from "./timezone";

// Logique des activités récurrentes du jardin (migration 003) — pas de
// "use server" ici : ce module n'expose aucune Server Action, il est
// importé aussi bien par src/lib/garden-actions.ts (création/modification/
// suppression d'une activité) que par src/lib/actions.ts (setStatusAction/
// deleteTaskAction, pour avancer à la période suivante quand la tâche
// générée est clôturée ou supprimée) — même montage que src/lib/rewards.ts.

export const GARDEN_CATEGORY_SLUG = "jardin";

function sortedUniqueMonths(months: number[]): number[] {
  return [...new Set(months)].sort((a, b) => a - b);
}

// Année/mois civils courants à Paris (pas UTC) — une activité "en cours en
// octobre" doit rester en octobre pour la famille même si le serveur
// (Vercel, UTC) a déjà basculé sur le 1er novembre à minuit UTC.
export function currentParisYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((p) => p.type === "year")!.value),
    month: Number(parts.find((p) => p.type === "month")!.value),
  };
}

// Prochaine période (mois/année) d'une activité à partir d'une période de
// référence. `strictlyAfter=false` (création, modification) : inclut la
// période de référence elle-même si elle y figure — une activité créée en
// plein mois concerné vise ce mois-ci, pas l'an prochain.
// `strictlyAfter=true` (clôture/suppression d'une occurrence) : avance
// obligatoirement à la période suivante, jamais celle qui vient de se
// terminer.
export function nextGardenOccurrence(
  months: number[],
  refYear: number,
  refMonth: number,
  strictlyAfter: boolean
): { year: number; month: number } {
  const sorted = sortedUniqueMonths(months);
  const candidate = sorted.find((m) => (strictlyAfter ? m > refMonth : m >= refMonth));
  if (candidate !== undefined) return { year: refYear, month: candidate };
  return { year: refYear + 1, month: sorted[0] };
}

// Échéance d'une occurrence : le 1er du mois concerné, 9h heure de Paris —
// exportée pour src/lib/garden-actions.ts (recalcul de l'échéance d'une
// tâche ouverte quand son mois n'appartient plus aux périodes modifiées).
export function occurrenceDueAtIso(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return parisWallTimeToUtcIso(`${year}-${mm}-01T09:00`);
}

// Crée la tâche d'une occurrence (à la création de l'activité, à sa
// modification si la tâche ouverte doit être recréée, ou en avançant à la
// période suivante après clôture/suppression). Le créateur de l'activité
// est toujours ajouté comme éditeur (même convention que createTaskAction
// dans src/lib/actions.ts : il garde l'accès même s'il n'est pas
// responsable désigné), les responsables reçoivent une notification s'ils
// ne sont pas eux-mêmes le créateur. `checklistLabels` (22/09/2026) : la
// checklist de l'occurrence précédente (ou saisie au formulaire de
// création), recopiée non cochée — voir syncChecklistItems pour la mise à
// jour d'une checklist déjà en base (activité modifiée avec tâche ouverte).
export async function createGardenOccurrenceTask(
  activity: { id: string; name: string; description: string; createdBy: string },
  assigneeIds: string[],
  year: number,
  month: number,
  checklistLabels: string[] = []
): Promise<void> {
  const dueAt = occurrenceDueAtIso(year, month);
  const visibility = computeVisibility(activity.createdBy, assigneeIds);

  const rows = await sql`
    insert into tasks (
      title, description, due_at, recurrence, category, created_by,
      garden_activity_id, garden_occurrence_month, garden_occurrence_year, visibility
    )
    values (
      ${activity.name}, ${activity.description}, ${dueAt}, ${JSON.stringify({ type: "none" })},
      ${GARDEN_CATEGORY_SLUG}, ${activity.createdBy},
      ${activity.id}, ${month}, ${year}, ${visibility}
    )
    returning id
  `;
  const task = rows[0] as { id: string } | undefined;
  if (!task) return;

  const editorIds = Array.from(new Set([activity.createdBy, ...assigneeIds]));
  await sql`
    insert into task_assignees (task_id, user_id, role)
    select ${task.id}, u, 'editor' from unnest(${editorIds}::uuid[]) as u
  `;

  if (checklistLabels.length > 0) {
    await sql`
      insert into checklist_items (task_id, label)
      select ${task.id}, u from unnest(${checklistLabels}::text[]) as u
    `;
  }

  await Promise.all(
    assigneeIds
      .filter((id) => id !== activity.createdBy)
      .map((id) =>
        notifyUser({
          userId: id,
          type: "task_shared",
          taskId: task.id,
          title: `Nouvelle tâche Jardin : « ${activity.name} »`,
        })
      )
  );
}

// Avance une activité de jardin à sa période suivante — appelé depuis
// setStatusAction/deleteTaskAction (src/lib/actions.ts) quand la tâche
// clôturée/supprimée porte un garden_activity_id. `finishedMonth`/
// `finishedYear` sont ceux de l'occurrence qui vient de se terminer
// (garden_occurrence_month/year de la tâche) : la période suivante est
// calculée à partir de là, jamais du jour courant, pour rester correcte
// même si la tâche traînait en retard depuis plusieurs mois. `checklistLabels`
// (22/09/2026) : la checklist de la tâche qui vient de se terminer, à
// fournir par l'appelant (et non relue ici) — deleteTaskAction supprime la
// tâche, donc sa checklist (on delete cascade), avant d'appeler cette
// fonction ; il n'y aurait donc plus rien à lire à ce stade.
export async function advanceGardenActivity(
  gardenActivityId: string,
  finishedMonth: number,
  finishedYear: number,
  checklistLabels: string[] = []
): Promise<void> {
  const activityRows = await sql`
    select id, name, description, months, created_by
    from garden_activities
    where id = ${gardenActivityId}
  `;
  const activity = activityRows[0] as
    | { id: string; name: string; description: string; months: number[]; created_by: string }
    | undefined;
  if (!activity) return;

  const assigneeRows = await sql`
    select user_id from garden_activity_assignees where garden_activity_id = ${gardenActivityId}
  `;
  const assigneeIds = (assigneeRows as { user_id: string }[]).map((r) => r.user_id);

  const next = nextGardenOccurrence(activity.months, finishedYear, finishedMonth, true);
  await createGardenOccurrenceTask(
    { id: activity.id, name: activity.name, description: activity.description, createdBy: activity.created_by },
    assigneeIds,
    next.year,
    next.month,
    checklistLabels
  );
}

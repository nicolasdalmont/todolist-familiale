import { sql } from "./db";
import type { CarActivity, ChecklistItem, Profile, Recurrence, TaskStatus } from "./types";

// Lecture des activités voiture (onglet Voiture, src/app/voiture/page.tsx)
// — quatre requêtes en parallèle plutôt qu'un gros join, même approche que
// getGardenActivities() (src/lib/garden-queries.ts). Seules les activités
// non closes sont renvoyées : une activité clôturée est remplacée par son
// instance suivante (voir src/lib/car.ts::advanceCarActivity), elle ne
// doit donc plus apparaître dans la liste principale.
export async function getCarActivities(): Promise<CarActivity[]> {
  const [activityRows, assigneeRows, taskRows, checklistRows] = await Promise.all([
    sql`
      select id, name, description, to_char(due_date, 'YYYY-MM-DD') as due_date,
             day_known, recurrence, status, created_by, created_at
      from car_activities
      where status not in ('done', 'archived')
      order by due_date asc
    `,
    sql`
      select ca.car_activity_id as car_activity_id,
             u.id as id, u.name as name, u.color as color
      from car_activity_assignees ca
      join users u on u.id = ca.user_id
      order by u.name
    `,
    sql`
      select id, car_activity_id, status, due_at
      from tasks
      where car_activity_id is not null and status not in ('done', 'archived')
    `,
    // Checklist de la tâche en cours de chaque activité (voir le
    // commentaire sur CarActivity.openTask, src/lib/types.ts).
    sql`
      select t.car_activity_id as car_activity_id, ci.id, ci.label, ci.done, ci.created_at
      from checklist_items ci
      join tasks t on t.id = ci.task_id
      where t.car_activity_id is not null and t.status not in ('done', 'archived')
      order by ci.created_at asc
    `,
  ]);

  const assigneesByActivity = new Map<string, Pick<Profile, "id" | "name" | "color">[]>();
  for (const row of assigneeRows as Array<{ car_activity_id: string; id: string; name: string; color: string }>) {
    const list = assigneesByActivity.get(row.car_activity_id) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    assigneesByActivity.set(row.car_activity_id, list);
  }

  const checklistByActivity = new Map<string, ChecklistItem[]>();
  for (const row of checklistRows as Array<ChecklistItem & { car_activity_id: string }>) {
    const list = checklistByActivity.get(row.car_activity_id) ?? [];
    list.push({ id: row.id, label: row.label, done: row.done, created_at: row.created_at });
    checklistByActivity.set(row.car_activity_id, list);
  }

  const taskByActivity = new Map<string, { id: string; status: TaskStatus; due_at: string | null; checklist: ChecklistItem[] }>();
  for (const row of taskRows as Array<{ id: string; car_activity_id: string; status: TaskStatus; due_at: string | null }>) {
    taskByActivity.set(row.car_activity_id, {
      id: row.id,
      status: row.status,
      due_at: row.due_at,
      checklist: checklistByActivity.get(row.car_activity_id) ?? [],
    });
  }

  return (
    activityRows as Array<{
      id: string;
      name: string;
      description: string;
      due_date: string;
      day_known: boolean;
      recurrence: Recurrence;
      status: TaskStatus;
      created_by: string;
      created_at: string;
    }>
  ).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    dueDate: a.due_date,
    dayKnown: a.day_known,
    recurrence: a.recurrence,
    status: a.status,
    createdBy: a.created_by,
    createdAt: a.created_at,
    assignees: assigneesByActivity.get(a.id) ?? [],
    openTask: taskByActivity.get(a.id) ?? null,
  }));
}

import { sql } from "./db";
import type { HealthActivity, Profile, Recurrence, TaskStatus } from "./types";

// Lecture des activités santé (onglet Santé, src/app/sante/page.tsx) —
// trois requêtes en parallèle plutôt qu'un gros join, même approche que
// getCarActivities() (src/lib/car-queries.ts). Seules les activités non
// closes sont renvoyées : une activité clôturée est remplacée par son
// instance suivante (voir src/lib/health.ts::advanceHealthActivity), elle
// ne doit donc plus apparaître dans la liste principale.
export async function getHealthActivities(): Promise<HealthActivity[]> {
  const [activityRows, assigneeRows, taskRows] = await Promise.all([
    sql`
      select id, name, description, to_char(due_date, 'YYYY-MM-DD') as due_date,
             day_known, recurrence, status, created_by, created_at
      from health_activities
      where status not in ('done', 'archived')
      order by due_date asc
    `,
    sql`
      select ha.health_activity_id as health_activity_id,
             u.id as id, u.name as name, u.color as color
      from health_activity_assignees ha
      join users u on u.id = ha.user_id
      order by u.name
    `,
    sql`
      select id, health_activity_id, status, due_at
      from tasks
      where health_activity_id is not null and status not in ('done', 'archived')
    `,
  ]);

  const assigneesByActivity = new Map<string, Pick<Profile, "id" | "name" | "color">[]>();
  for (const row of assigneeRows as Array<{ health_activity_id: string; id: string; name: string; color: string }>) {
    const list = assigneesByActivity.get(row.health_activity_id) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    assigneesByActivity.set(row.health_activity_id, list);
  }

  const taskByActivity = new Map<string, { id: string; status: TaskStatus; due_at: string | null }>();
  for (const row of taskRows as Array<{ id: string; health_activity_id: string; status: TaskStatus; due_at: string | null }>) {
    taskByActivity.set(row.health_activity_id, { id: row.id, status: row.status, due_at: row.due_at });
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

import { sql } from "./db";
import type { GardenActivity, Profile, TaskStatus } from "./types";

// Lecture des activités de jardin (onglet Jardin, src/app/jardin/page.tsx)
// — trois requêtes en parallèle plutôt qu'un gros join, même approche que
// getTasks()/attachRelations() dans src/lib/queries.ts : plus simple à
// relire qu'un join à trois tables, le volume de données reste minuscule
// (quelques dizaines d'activités au plus).
export async function getGardenActivities(): Promise<GardenActivity[]> {
  const [activityRows, assigneeRows, taskRows] = await Promise.all([
    sql`select id, name, description, months, created_by, created_at from garden_activities order by created_at asc`,
    sql`
      select ga.garden_activity_id as garden_activity_id,
             u.id as id, u.name as name, u.color as color
      from garden_activity_assignees ga
      join users u on u.id = ga.user_id
      order by u.name
    `,
    sql`
      select id, garden_activity_id, status, due_at
      from tasks
      where garden_activity_id is not null and status not in ('done', 'archived')
    `,
  ]);

  const assigneesByActivity = new Map<string, Pick<Profile, "id" | "name" | "color">[]>();
  for (const row of assigneeRows as Array<{ garden_activity_id: string; id: string; name: string; color: string }>) {
    const list = assigneesByActivity.get(row.garden_activity_id) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    assigneesByActivity.set(row.garden_activity_id, list);
  }

  const taskByActivity = new Map<string, { id: string; status: TaskStatus; due_at: string | null }>();
  for (const row of taskRows as Array<{ id: string; garden_activity_id: string; status: TaskStatus; due_at: string | null }>) {
    taskByActivity.set(row.garden_activity_id, { id: row.id, status: row.status, due_at: row.due_at });
  }

  return (
    activityRows as Array<{
      id: string;
      name: string;
      description: string;
      months: number[];
      created_by: string;
      created_at: string;
    }>
  ).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    months: [...a.months].sort((x, y) => x - y),
    createdBy: a.created_by,
    createdAt: a.created_at,
    assignees: assigneesByActivity.get(a.id) ?? [],
    openTask: taskByActivity.get(a.id) ?? null,
  }));
}

import { sql } from "./db";
import type { Category, ChecklistItem, GardenActivity, Profile, TaskStatus } from "./types";
import { DEFAULT_GARDEN_CATEGORIES } from "./garden-categories";

// Lecture des activités de jardin (onglet Jardin, src/app/jardin/page.tsx)
// — quatre requêtes en parallèle plutôt qu'un gros join, même approche que
// getTasks()/attachRelations() dans src/lib/queries.ts : plus simple à
// relire qu'un join à quatre tables, le volume de données reste minuscule
// (quelques dizaines d'activités au plus).
export async function getGardenActivities(): Promise<GardenActivity[]> {
  const [activityRows, assigneeRows, taskRows, checklistRows] = await Promise.all([
    sql`select id, name, description, months, category, created_by, created_at from garden_activities order by created_at asc`,
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
    // Checklist de la tâche en cours de chaque activité (voir le
    // commentaire sur GardenActivity.openTask, src/lib/types.ts).
    sql`
      select t.garden_activity_id as garden_activity_id, ci.id, ci.label, ci.done, ci.created_at
      from checklist_items ci
      join tasks t on t.id = ci.task_id
      where t.garden_activity_id is not null and t.status not in ('done', 'archived')
      order by ci.created_at asc
    `,
  ]);

  const assigneesByActivity = new Map<string, Pick<Profile, "id" | "name" | "color">[]>();
  for (const row of assigneeRows as Array<{ garden_activity_id: string; id: string; name: string; color: string }>) {
    const list = assigneesByActivity.get(row.garden_activity_id) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    assigneesByActivity.set(row.garden_activity_id, list);
  }

  const checklistByActivity = new Map<string, ChecklistItem[]>();
  for (const row of checklistRows as Array<ChecklistItem & { garden_activity_id: string }>) {
    const list = checklistByActivity.get(row.garden_activity_id) ?? [];
    list.push({ id: row.id, label: row.label, done: row.done, created_at: row.created_at });
    checklistByActivity.set(row.garden_activity_id, list);
  }

  const taskByActivity = new Map<string, { id: string; status: TaskStatus; due_at: string | null; checklist: ChecklistItem[] }>();
  for (const row of taskRows as Array<{ id: string; garden_activity_id: string; status: TaskStatus; due_at: string | null }>) {
    taskByActivity.set(row.garden_activity_id, {
      id: row.id,
      status: row.status,
      due_at: row.due_at,
      checklist: checklistByActivity.get(row.garden_activity_id) ?? [],
    });
  }

  return (
    activityRows as Array<{
      id: string;
      name: string;
      description: string;
      months: number[];
      category: string;
      created_by: string;
      created_at: string;
    }>
  ).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    months: [...a.months].sort((x, y) => x - y),
    category: a.category,
    createdBy: a.created_by,
    createdAt: a.created_at,
    assignees: assigneesByActivity.get(a.id) ?? [],
    openTask: taskByActivity.get(a.id) ?? null,
  }));
}

// Catégories des activités de jardin (table `garden_activity_categories`,
// migration 004) — même moule que getCategories() dans src/lib/queries.ts.
export async function getGardenActivityCategories(): Promise<Category[]> {
  try {
    const rows = (await sql`
      select slug, label, icon, position from garden_activity_categories order by position
    `) as unknown as Category[];
    return rows.length > 0 ? rows : DEFAULT_GARDEN_CATEGORIES;
  } catch (e) {
    console.error("getGardenActivityCategories:", e instanceof Error ? e.message : e);
    return DEFAULT_GARDEN_CATEGORIES;
  }
}

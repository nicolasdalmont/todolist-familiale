import { sql } from "./db";

// Parsing/synchronisation de checklist, partagés entre src/lib/actions.ts
// (tâches) et les Server Actions d'activités d'agenda (garden/car/health/
// finances-actions.ts, depuis le 22/09/2026) — extrait de actions.ts pour
// être importable depuis ces modules sans passer par un fichier "use
// server" (qui n'autorise que des exports async).

// Checklist soumise par un formulaire (champ "checklist", encodé en JSON) :
// {id?, label}[], `id` absent pour un item pas encore en base.
export function parseChecklistItems(formData: FormData): { id?: string; label: string }[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("checklist") || "[]"));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" && item.id ? item.id : undefined,
      label: String(item.label ?? "").trim(),
    }))
    .filter((item) => item.label.length > 0);
}

// Pas question d'un delete + insert intégral : ça réinitialiserait `done`
// sur tous les items existants, alors que cocher/décocher (géré à part)
// doit survivre à un enregistrement du formulaire. Diff explicite à la
// place : supprime les items retirés, renomme ceux qui ont un id (sans
// toucher `done`), insère les nouveaux.
export async function syncChecklistItems(taskId: string, items: { id?: string; label: string }[]) {
  const keepIds = items.filter((i) => i.id).map((i) => i.id as string);
  if (keepIds.length > 0) {
    await sql`delete from checklist_items where task_id = ${taskId} and id <> all(${keepIds}::uuid[])`;
  } else {
    await sql`delete from checklist_items where task_id = ${taskId}`;
  }
  for (const item of items) {
    if (item.id) {
      await sql`update checklist_items set label = ${item.label} where id = ${item.id} and task_id = ${taskId}`;
    } else {
      await sql`insert into checklist_items (task_id, label) values (${taskId}, ${item.label})`;
    }
  }
}

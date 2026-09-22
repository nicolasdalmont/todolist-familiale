import { sql } from "./db";
import type { Idea } from "./types";

// Lecture des idées (onglet Idées, migration 010) — triées par date de
// création décroissante (les plus récentes en premier), même convention
// que mabedetheque. Le nom de l'auteur est joint directement plutôt que
// résolu côté client : le volume reste minuscule, pas besoin de la
// Map<id, Profile> utilisée pour des listes plus lourdes (getTasks()).
export async function getIdeas(): Promise<Idea[]> {
  const rows = await sql`
    select i.id, i.content, i.status, i.created_by, u.name as created_by_name, i.created_at
    from ideas i
    join users u on u.id = i.created_by
    order by i.created_at desc
  `;
  return (
    rows as Array<{
      id: string;
      content: string;
      status: Idea["status"];
      created_by: string;
      created_by_name: string;
      created_at: string;
    }>
  ).map((r) => ({
    id: r.id,
    content: r.content,
    status: r.status,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
  }));
}

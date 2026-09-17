"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

// Gestion des tags, réservée au rôle admin (bloc « Tags » de l'onglet
// « Catégories » de l'écran /admin — voir src/components/TagManager.tsx).
// Les tags eux-mêmes se créent librement depuis TaskForm.tsx ; ce fichier ne
// couvre que le ménage : supprimer un tag, ou en fusionner deux (les tâches
// du tag source basculent sur le tag cible, puis le tag source disparaît) —
// pour éviter que la liste ne s'éparpille en variantes proches au fil du
// temps.

type Result = { error?: string; ok?: boolean };

// Les tags apparaissent sur beaucoup d'écrans (cartes, filtres,
// formulaires) — on invalide tout l'arbre plutôt que d'énumérer.
function revalidate() {
  revalidatePath("/", "layout");
}

export async function deleteTagAction(tagId: string): Promise<Result> {
  await requireAdmin();
  if (!tagId) return { error: "Tag introuvable." };

  const rows = await sql`select id from tags where id = ${tagId}`;
  if (rows.length === 0) return { error: "Tag introuvable." };

  try {
    // ON DELETE CASCADE sur task_tags : retire le tag de toutes les tâches
    // qui le portaient.
    await sql`delete from tags where id = ${tagId}`;
  } catch {
    return { error: "Impossible de supprimer ce tag. Réessaie." };
  }

  revalidate();
  return { ok: true };
}

export async function mergeTagsAction(sourceId: string, targetId: string): Promise<Result> {
  await requireAdmin();
  if (!sourceId || !targetId) return { error: "Tag introuvable." };
  if (sourceId === targetId) return { error: "Choisis un tag différent." };

  const rows = (await sql`select id, name from tags where id = any(${[sourceId, targetId]}::uuid[])`) as {
    id: string;
    name: string;
  }[];
  const source = rows.find((t) => t.id === sourceId);
  const target = rows.find((t) => t.id === targetId);
  if (!source || !target) return { error: "Tag introuvable." };

  try {
    // Reporte les tâches du tag source sur le tag cible (une tâche qui
    // portait déjà les deux ne doit pas violer la clé primaire composite).
    await sql`
      insert into task_tags (task_id, tag_id)
      select task_id, ${targetId} from task_tags where tag_id = ${sourceId}
      on conflict (task_id, tag_id) do nothing
    `;
    // Supprime le tag source (cascade : retire ses entrées task_tags
    // restantes, désormais toutes reportées sur la cible).
    await sql`delete from tags where id = ${sourceId}`;
  } catch {
    return { error: "Impossible de fusionner ces tags. Réessaie." };
  }

  revalidate();
  return { ok: true };
}

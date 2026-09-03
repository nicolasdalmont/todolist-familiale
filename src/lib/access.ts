import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task, Visibility } from "./types";

type DB = SupabaseClient<any, "public", any>;

// Contrôle d'accès aux tâches : chaque tâche est privée par défaut (visible
// uniquement par son créateur) et n'est visible/éditable par d'autres que
// si son créateur les a explicitement ajoutés dans task_assignees, avec un
// rôle :
//   - "editor" : voit, modifie, change le statut, commente. Le créateur est
//     toujours "editor" (imposé côté serveur, voir src/lib/actions.ts).
//   - "viewer" : voit et commente, sans pouvoir modifier.
// La colonne tasks.visibility ("shared"/"private") est purement dérivée de
// ce partage et recalculée à chaque écriture (computeVisibility ci-dessous)
// — elle n'est plus jamais saisie par l'utilisateur.

export function canView(task: Task, userId: string): boolean {
  if (task.created_by === userId) return true;
  return (task.assignees ?? []).some((a) => a.id === userId);
}

export function canEdit(task: Task, userId: string): boolean {
  if (task.created_by === userId) return true;
  return (task.assignees ?? []).some((a) => a.id === userId && a.role === "editor");
}

// "private" si seul le créateur a accès à la tâche, "shared" dès qu'au
// moins une autre personne (éditeur ou lecteur) y a accès.
export function computeVisibility(creatorId: string, shareUserIds: string[]): Visibility {
  const others = shareUserIds.filter((id) => id !== creatorId);
  return others.length > 0 ? "shared" : "private";
}

// Vérifie les droits d'un utilisateur sur une tâche par son id, sans avoir
// à recharger toute la tâche avec ses jointures — utilisé par les Server
// Actions (modifier/supprimer/changer le statut/commenter) qui n'ont pas
// déjà la tâche en mémoire. Renvoie exists:false si la tâche n'existe plus.
//
// Renvoie aussi `title`/`visibility` : pratique pour les appelants qui
// n'ont pas non plus la tâche en mémoire mais en ont besoin pour journaliser
// une activité (voir logActivity dans src/lib/actions.ts) — évite une
// deuxième requête. `visibility` sert notamment à ne journaliser une action
// que si la tâche est effectivement partagée (au moins une autre personne
// que le créateur y a accès), pas sur une tâche privée où personne d'autre
// ne pourrait de toute façon voir l'activité.
export async function getTaskAccess(
  supabase: DB,
  taskId: string,
  userId: string
): Promise<{
  exists: boolean;
  createdBy?: string;
  title?: string;
  visibility?: Visibility;
  canView: boolean;
  canEdit: boolean;
}> {
  const { data: task } = await supabase
    .from("tasks")
    .select("id, created_by, title, visibility")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { exists: false, canView: false, canEdit: false };

  if (task.created_by === userId) {
    return {
      exists: true,
      createdBy: task.created_by,
      title: task.title,
      visibility: task.visibility,
      canView: true,
      canEdit: true,
    };
  }

  const { data: share } = await supabase
    .from("task_assignees")
    .select("role")
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!share) {
    return {
      exists: true,
      createdBy: task.created_by,
      title: task.title,
      visibility: task.visibility,
      canView: false,
      canEdit: false,
    };
  }
  return {
    exists: true,
    createdBy: task.created_by,
    title: task.title,
    visibility: task.visibility,
    canView: true,
    canEdit: share.role === "editor",
  };
}

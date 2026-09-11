import type { Task, Visibility } from "./types";

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

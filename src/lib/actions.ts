"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithPasswordHash, upsertTagIds } from "@/lib/queries";
import { computeVisibility, getTaskAccess } from "@/lib/access";
import {
  clearSessionCookie,
  getSessionUserId,
  hashPassword,
  recordLogin,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { computeNextOccurrence, STATUS_LABELS } from "@/lib/format";
import { DEFAULT_CATEGORY, isCategory } from "@/lib/categories";
import type { ActivityType, Recurrence, ShareRole, TaskStatus } from "@/lib/types";

async function syncTaskTags(supabase: ReturnType<typeof createAdminClient>, taskId: string, tagNames: string[]) {
  const tagIds = await upsertTagIds(supabase, tagNames);
  await supabase.from("task_tags").delete().eq("task_id", taskId);
  if (tagIds.length) {
    const rows = tagIds.map((tagId) => ({ task_id: taskId, tag_id: tagId }));
    const { error } = await supabase.from("task_tags").insert(rows);
    if (error) throw new Error(error.message);
  }
}

// Lit le partage soumis par TaskForm.tsx : un champ radio "role-<userId>"
// par membre de la famille (hors créateur, qui n'est pas dans le
// formulaire), valant "editor" ou "viewer". Le créateur est toujours
// forcé "editor", quoi que le formulaire contienne — c'est ce qui
// garantit qu'il ne perd jamais l'accès à ses propres tâches.
function parseShareRoles(formData: FormData, creatorId: string): Map<string, ShareRole> {
  const roles = new Map<string, ShareRole>();
  for (const [key, value] of formData.entries()) {
    const match = /^role-(.+)$/.exec(key);
    if (match && (value === "editor" || value === "viewer")) {
      roles.set(match[1], value);
    }
  }
  roles.set(creatorId, "editor");
  return roles;
}

// --- Journal d'activité --------------------------------------------------
//
// Alimente le fil "Activité du jour" de l'écran d'accueil
// (src/components/ActivityFeed.tsx) : trace une action faite sur une tâche
// pour informer les autres personnes qui y ont accès de ce qui s'y passe.
// N'est appelé qu'avec une tâche `shared` (au moins une autre personne que
// le créateur y a accès) — sur une tâche privée, personne d'autre ne
// pourrait de toute façon voir cette activité, inutile de l'écrire.
//
// Écriture volontairement non bloquante : si la table `activity_log`
// n'existe pas encore (supabase/migrations/005_activity_log.sql pas encore
// appliquée) ou pour toute autre erreur d'écriture, on logue côté serveur
// et on continue plutôt que de faire échouer l'action principale (créer une
// tâche, commenter, etc.), qui elle doit toujours réussir.
async function logActivity(
  supabase: ReturnType<typeof createAdminClient>,
  params: { taskId: string; actorId: string; type: ActivityType; taskTitle: string; detail?: string | null }
) {
  try {
    const { error } = await supabase.from("activity_log").insert({
      task_id: params.taskId,
      actor_id: params.actorId,
      type: params.type,
      task_title: params.taskTitle,
      detail: params.detail ?? null,
    });
    if (error) console.error("logActivity:", error.message);
  } catch (e) {
    console.error("logActivity:", e);
  }
}

function parseRecurrence(formData: FormData): Recurrence {
  const type = String(formData.get("recurrenceType") || "none") as Recurrence["type"];
  if (type === "custom") {
    return {
      type: "custom",
      interval: Number(formData.get("recurrenceInterval")) || 1,
      unit: (String(formData.get("recurrenceUnit") || "weeks") as Recurrence["unit"]) ?? "weeks",
    };
  }
  return { type, interval: 1 };
}

// --- Authentification -------------------------------------------------

// Connexion "normale" : l'utilisateur a déjà défini son propre mot de
// passe (password_set = true).
export async function loginAction(
  userId: string,
  password: string
): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  const user = await getUserWithPasswordHash(supabase, userId);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: "Mot de passe incorrect." };
  }

  await setSessionCookie(user.id);
  await recordLogin(user.id);
  redirect("/");
}

// Première connexion (mot de passe temporaire) ou changement volontaire de
// mot de passe : vérifie le mot de passe actuel/temporaire, puis enregistre
// le nouveau et ouvre une session.
export async function setPasswordAction(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ error?: string }> {
  if (newPassword.length < 6) {
    return { error: "Le mot de passe doit contenir au moins 6 caractères." };
  }

  const supabase = createAdminClient();
  const user = await getUserWithPasswordHash(supabase, userId);

  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return {
      error: user?.password_set
        ? "Mot de passe actuel incorrect."
        : "Mot de passe temporaire incorrect.",
    };
  }

  const { error } = await supabase
    .from("users")
    .update({ password_hash: hashPassword(newPassword), password_set: true })
    .eq("id", userId);

  if (error) return { error: "Impossible d'enregistrer le nouveau mot de passe. Réessaie." };

  await setSessionCookie(userId);
  await recordLogin(userId);
  redirect("/");
}

export async function signOutAction() {
  clearSessionCookie();
  redirect("/login");
}

// --- Tâches -------------------------------------------------------------

export async function createTaskAction(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();

  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const description = String(formData.get("description") || "");
  const dueAtRaw = String(formData.get("dueAt") || "");
  const dueAt = dueAtRaw ? new Date(dueAtRaw).toISOString() : null;
  const recurrence = parseRecurrence(formData);
  const categoryRaw = String(formData.get("category") || "");
  const category = isCategory(categoryRaw) ? categoryRaw : DEFAULT_CATEGORY;
  const tagNames = formData.getAll("tags").map(String);

  const shareRoles = parseShareRoles(formData, userId);
  const visibility = computeVisibility(userId, Array.from(shareRoles.keys()));

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description,
      due_at: dueAt,
      visibility,
      recurrence,
      category,
      created_by: userId,
    })
    .select()
    .single();

  if (error || !task) {
    throw new Error(error?.message || "Impossible de créer la tâche.");
  }

  const rows = Array.from(shareRoles.entries()).map(([id, role]) => ({ task_id: task.id, user_id: id, role }));
  const { error: assignError } = await supabase.from("task_assignees").insert(rows);
  if (assignError) throw new Error(assignError.message);

  await syncTaskTags(supabase, task.id, tagNames);

  if (visibility === "shared") {
    await logActivity(supabase, { taskId: task.id, actorId: userId, type: "task_created", taskTitle: title });
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  redirect(`/tasks/${task.id}`);
}

export async function updateTaskAction(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();
  const taskId = String(formData.get("taskId"));
  if (!taskId) return;

  const access = await getTaskAccess(supabase, taskId, userId);
  if (!access.exists) return;
  if (!access.canEdit) {
    throw new Error("Tu n'as pas le droit de modifier cette tâche.");
  }
  const creatorId = access.createdBy!;

  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const description = String(formData.get("description") || "");
  const dueAtRaw = String(formData.get("dueAt") || "");
  const dueAt = dueAtRaw ? new Date(dueAtRaw).toISOString() : null;
  const status = String(formData.get("status") || "todo");
  const recurrence = parseRecurrence(formData);
  const categoryRaw = String(formData.get("category") || "");
  const category = isCategory(categoryRaw) ? categoryRaw : DEFAULT_CATEGORY;
  const tagNames = formData.getAll("tags").map(String);

  // Le créateur original garde toujours l'accès complet, même si la
  // personne qui modifie la tâche est un autre éditeur que lui.
  const shareRoles = parseShareRoles(formData, creatorId);
  const visibility = computeVisibility(creatorId, Array.from(shareRoles.keys()));

  const { error } = await supabase
    .from("tasks")
    .update({ title, description, due_at: dueAt, visibility, status, recurrence, category })
    .eq("id", taskId);
  if (error) throw new Error(error.message);

  await supabase.from("task_assignees").delete().eq("task_id", taskId);
  const rows = Array.from(shareRoles.entries()).map(([id, role]) => ({ task_id: taskId, user_id: id, role }));
  const { error: assignError } = await supabase.from("task_assignees").insert(rows);
  if (assignError) throw new Error(assignError.message);

  await syncTaskTags(supabase, taskId, tagNames);

  if (visibility === "shared") {
    await logActivity(supabase, { taskId, actorId: userId, type: "task_updated", taskTitle: title });
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function deleteTaskAction(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();
  const taskId = String(formData.get("taskId"));
  if (!taskId) return;

  const access = await getTaskAccess(supabase, taskId, userId);
  if (!access.exists) return;
  if (!access.canEdit) {
    throw new Error("Tu n'as pas le droit de supprimer cette tâche.");
  }

  await supabase.from("tasks").delete().eq("id", taskId);
  revalidatePath("/");
  revalidatePath("/tasks");
  redirect("/tasks");
}

// Change le statut d'une tâche. Si elle est récurrente et clôturée
// ("done"), régénère automatiquement la prochaine occurrence avec les
// mêmes assignations.
export async function setStatusAction(taskId: string, status: string) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();

  const access = await getTaskAccess(supabase, taskId, userId);
  if (!access.exists) return;
  if (!access.canEdit) {
    throw new Error("Tu n'as pas le droit de modifier le statut de cette tâche.");
  }

  const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (!task) return;

  const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
  if (error) throw new Error(error.message);

  if (task.visibility === "shared") {
    await logActivity(supabase, {
      taskId,
      actorId: userId,
      type: "status_changed",
      taskTitle: task.title,
      detail: STATUS_LABELS[status as TaskStatus] ?? status,
    });
  }

  if (status === "done" && task.recurrence && task.recurrence.type !== "none") {
    const next = computeNextOccurrence(task.due_at, task.recurrence);
    if (next) {
      const { data: newTask } = await supabase
        .from("tasks")
        .insert({
          title: task.title,
          description: task.description,
          due_at: next,
          recurrence: task.recurrence,
          visibility: task.visibility,
          category: task.category,
          created_by: task.created_by,
          status: "todo",
        })
        .select()
        .single();

      if (newTask) {
        const [{ data: assignees }, { data: taskTags }, { data: checklistItems }] = await Promise.all([
          supabase.from("task_assignees").select("user_id, role").eq("task_id", taskId),
          supabase.from("task_tags").select("tag_id").eq("task_id", taskId),
          supabase.from("checklist_items").select("label").eq("task_id", taskId),
        ]);
        if (assignees?.length) {
          await supabase
            .from("task_assignees")
            .insert(assignees.map((a) => ({ task_id: newTask.id, user_id: a.user_id, role: a.role })));
        }
        if (taskTags?.length) {
          await supabase
            .from("task_tags")
            .insert(taskTags.map((t) => ({ task_id: newTask.id, tag_id: t.tag_id })));
        }
        // La checklist repart décochée sur la nouvelle occurrence — recopier
        // l'état "coché" de la tâche qui vient de se terminer n'aurait pas
        // de sens pour une tâche récurrente (ex. liste de courses).
        if (checklistItems?.length) {
          await supabase
            .from("checklist_items")
            .insert(checklistItems.map((c) => ({ task_id: newTask.id, label: c.label, done: false })));
        }
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function addCommentAction(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();
  const taskId = String(formData.get("taskId"));
  const body = String(formData.get("body") || "").trim();
  if (!taskId || !body) return;

  // Un lecteur ("viewer") peut commenter, pas seulement un éditeur — voir
  // src/lib/access.ts.
  const access = await getTaskAccess(supabase, taskId, userId);
  if (!access.exists || !access.canView) return;

  const { error } = await supabase.from("comments").insert({ task_id: taskId, author_id: userId, body });
  if (error) throw new Error(error.message);

  if (access.visibility === "shared") {
    await logActivity(supabase, { taskId, actorId: userId, type: "comment_added", taskTitle: access.title ?? "" });
  }

  revalidatePath(`/tasks/${taskId}`);
}

// Un commentaire peut être supprimé par son propre auteur, ou par le
// créateur de la tâche (qui reste responsable de sa tâche et peut modérer
// les commentaires qui y sont laissés) — pas par un simple éditeur/lecteur
// assigné, qui n'a pas ce rôle de modération. Contrairement à
// addCommentAction (ouvert à canView), la suppression n'est donc pas basée
// sur getTaskAccess().canEdit — un éditeur assigné ne peut pas supprimer le
// commentaire de quelqu'un d'autre.
export async function deleteCommentAction(taskId: string, commentId: string) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();

  const { data: comment } = await supabase
    .from("comments")
    .select("id, task_id, author_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment || comment.task_id !== taskId) return;

  const access = await getTaskAccess(supabase, taskId, userId);
  if (!access.exists) return;
  const canDelete = comment.author_id === userId || access.createdBy === userId;
  if (!canDelete) return;

  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw new Error(error.message);

  if (access.visibility === "shared") {
    await logActivity(supabase, { taskId, actorId: userId, type: "comment_deleted", taskTitle: access.title ?? "" });
  }

  revalidatePath(`/tasks/${taskId}`);
}

// --- Checklist ------------------------------------------------------
//
// Gérée directement depuis l'écran de détail (pas depuis le formulaire de
// création/modification) — voir src/components/ChecklistSection.tsx.
// Ajouter/cocher/supprimer un item exige canEdit, comme changer le statut
// de la tâche (contrairement aux commentaires, ouverts aux lecteurs) : une
// checklist fait partie du contenu de la tâche, pas d'une discussion
// autour.

export async function addChecklistItemAction(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();
  const taskId = String(formData.get("taskId"));
  const label = String(formData.get("label") || "").trim();
  if (!taskId || !label) return;

  const access = await getTaskAccess(supabase, taskId, userId);
  if (!access.exists || !access.canEdit) return;

  const { error } = await supabase.from("checklist_items").insert({ task_id: taskId, label });
  if (error) throw new Error(error.message);

  if (access.visibility === "shared") {
    await logActivity(supabase, {
      taskId,
      actorId: userId,
      type: "checklist_item_added",
      taskTitle: access.title ?? "",
      detail: label,
    });
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function toggleChecklistItemAction(taskId: string, itemId: string, done: boolean) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();
  const access = await getTaskAccess(supabase, taskId, userId);
  if (!access.exists || !access.canEdit) return;

  // Le filtre .eq("task_id", taskId) est une ceinture-bretelles : garantit
  // qu'un itemId ne peut agir que sur la tâche pour laquelle l'accès vient
  // d'être vérifié, même si itemId provenait d'ailleurs. .select().single()
  // récupère le libellé de l'item pour le journal d'activité, sans requête
  // supplémentaire.
  const { data: updated, error } = await supabase
    .from("checklist_items")
    .update({ done })
    .eq("id", itemId)
    .eq("task_id", taskId)
    .select("label")
    .single();
  if (error) throw new Error(error.message);

  if (access.visibility === "shared") {
    await logActivity(supabase, {
      taskId,
      actorId: userId,
      type: done ? "checklist_item_checked" : "checklist_item_unchecked",
      taskTitle: access.title ?? "",
      detail: updated?.label ?? null,
    });
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function deleteChecklistItemAction(taskId: string, itemId: string) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();
  const access = await getTaskAccess(supabase, taskId, userId);
  if (!access.exists || !access.canEdit) return;

  // Le libellé est récupéré avant suppression : il n'existera plus pour le
  // journal d'activité une fois la ligne supprimée.
  const { data: item } = await supabase
    .from("checklist_items")
    .select("label")
    .eq("id", itemId)
    .eq("task_id", taskId)
    .maybeSingle();

  const { error } = await supabase.from("checklist_items").delete().eq("id", itemId).eq("task_id", taskId);
  if (error) throw new Error(error.message);

  if (access.visibility === "shared") {
    await logActivity(supabase, {
      taskId,
      actorId: userId,
      type: "checklist_item_removed",
      taskTitle: access.title ?? "",
      detail: item?.label ?? null,
    });
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

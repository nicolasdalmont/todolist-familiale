"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithPasswordHash } from "@/lib/queries";
import {
  clearSessionCookie,
  getSessionUserId,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { computeNextOccurrence } from "@/lib/format";
import type { Recurrence } from "@/lib/types";

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
  const visibility = String(formData.get("visibility") || "shared");
  const recurrence = parseRecurrence(formData);

  const assigneeIds = new Set(formData.getAll("assignees").map(String));
  assigneeIds.add(userId);

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description,
      due_at: dueAt,
      visibility,
      recurrence,
      created_by: userId,
    })
    .select()
    .single();

  if (error || !task) {
    throw new Error(error?.message || "Impossible de créer la tâche.");
  }

  const rows = Array.from(assigneeIds).map((id) => ({ task_id: task.id, user_id: id }));
  const { error: assignError } = await supabase.from("task_assignees").insert(rows);
  if (assignError) throw new Error(assignError.message);

  revalidatePath("/");
  redirect(`/tasks/${task.id}`);
}

export async function updateTaskAction(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();
  const taskId = String(formData.get("taskId"));
  if (!taskId) return;

  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const description = String(formData.get("description") || "");
  const dueAtRaw = String(formData.get("dueAt") || "");
  const dueAt = dueAtRaw ? new Date(dueAtRaw).toISOString() : null;
  const visibility = String(formData.get("visibility") || "shared");
  const status = String(formData.get("status") || "todo");
  const recurrence = parseRecurrence(formData);
  const assigneeIds = Array.from(new Set(formData.getAll("assignees").map(String)));

  const { error } = await supabase
    .from("tasks")
    .update({ title, description, due_at: dueAt, visibility, status, recurrence })
    .eq("id", taskId);
  if (error) throw new Error(error.message);

  await supabase.from("task_assignees").delete().eq("task_id", taskId);
  if (assigneeIds.length) {
    const rows = assigneeIds.map((id) => ({ task_id: taskId, user_id: id }));
    const { error: assignError } = await supabase.from("task_assignees").insert(rows);
    if (assignError) throw new Error(assignError.message);
  }

  revalidatePath("/");
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function deleteTaskAction(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();
  const taskId = String(formData.get("taskId"));
  if (!taskId) return;
  await supabase.from("tasks").delete().eq("id", taskId);
  revalidatePath("/");
  redirect("/");
}

// Change le statut d'une tâche. Si elle est récurrente et clôturée
// ("done"), régénère automatiquement la prochaine occurrence avec les
// mêmes assignations.
export async function setStatusAction(taskId: string, status: string) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();

  const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (!task) return;

  const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
  if (error) throw new Error(error.message);

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
          created_by: task.created_by,
          status: "todo",
        })
        .select()
        .single();

      if (newTask) {
        const { data: assignees } = await supabase
          .from("task_assignees")
          .select("user_id")
          .eq("task_id", taskId);
        if (assignees?.length) {
          await supabase
            .from("task_assignees")
            .insert(assignees.map((a) => ({ task_id: newTask.id, user_id: a.user_id })));
        }
      }
    }
  }

  revalidatePath("/");
  revalidatePath(`/tasks/${taskId}`);
}

export async function addCommentAction(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const supabase = createAdminClient();
  const taskId = String(formData.get("taskId"));
  const body = String(formData.get("body") || "").trim();
  if (!taskId || !body) return;

  const { error } = await supabase.from("comments").insert({ task_id: taskId, author_id: userId, body });
  if (error) throw new Error(error.message);

  revalidatePath(`/tasks/${taskId}`);
}

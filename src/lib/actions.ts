"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

export async function signOutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createTaskAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const description = String(formData.get("description") || "");
  const dueAtRaw = String(formData.get("dueAt") || "");
  const dueAt = dueAtRaw ? new Date(dueAtRaw).toISOString() : null;
  const visibility = String(formData.get("visibility") || "shared");
  const recurrence = parseRecurrence(formData);

  const assigneeIds = new Set(formData.getAll("assignees").map(String));
  assigneeIds.add(user.id);

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description,
      due_at: dueAt,
      visibility,
      recurrence,
      created_by: user.id,
    })
    .select()
    .single();

  if (error || !task) {
    throw new Error(error?.message || "Impossible de créer la tâche.");
  }

  const rows = Array.from(assigneeIds).map((userId) => ({ task_id: task.id, user_id: userId }));
  const { error: assignError } = await supabase.from("task_assignees").insert(rows);
  if (assignError) throw new Error(assignError.message);

  revalidatePath("/");
  redirect(`/tasks/${task.id}`);
}

export async function updateTaskAction(formData: FormData) {
  const supabase = createClient();
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
    const rows = assigneeIds.map((userId) => ({ task_id: taskId, user_id: userId }));
    const { error: assignError } = await supabase.from("task_assignees").insert(rows);
    if (assignError) throw new Error(assignError.message);
  }

  revalidatePath("/");
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function deleteTaskAction(formData: FormData) {
  const supabase = createClient();
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
  const supabase = createClient();

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
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const taskId = String(formData.get("taskId"));
  const body = String(formData.get("body") || "").trim();
  if (!taskId || !body) return;

  const { error } = await supabase.from("comments").insert({ task_id: taskId, author_id: user.id, body });
  if (error) throw new Error(error.message);

  revalidatePath(`/tasks/${taskId}`);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Comment, Profile, Task } from "./types";

type DB = SupabaseClient<any, "public", any>;

export async function getProfiles(supabase: DB): Promise<Profile[]> {
  const { data, error } = await supabase.from("profiles").select("*").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getProfile(supabase: DB, id: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

interface TaskRow extends Task {
  task_assignees: { profiles: Profile }[] | null;
}

export async function getTasks(supabase: DB): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, task_assignees(profiles(id, name, role, color, created_at))")
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);

  return ((data as unknown as TaskRow[]) ?? []).map((row) => ({
    ...row,
    assignees: (row.task_assignees ?? []).map((a) => a.profiles).filter(Boolean),
  }));
}

export async function getTask(supabase: DB, id: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, task_assignees(profiles(id, name, role, color, created_at))")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as TaskRow;
  return {
    ...row,
    assignees: (row.task_assignees ?? []).map((a) => a.profiles).filter(Boolean),
  };
}

export async function getComments(supabase: DB, taskId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("*, author:profiles(id, name, role, color, created_at)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as unknown as Comment[]) ?? [];
}

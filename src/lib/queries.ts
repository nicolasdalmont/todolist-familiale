import type { SupabaseClient } from "@supabase/supabase-js";
import type { Comment, Profile, Task } from "./types";

type DB = SupabaseClient<any, "public", any>;

// Colonnes sûres à exposer à l'interface : ne sélectionne jamais
// password_hash, même si le client passé ici est le client admin
// (service_role) qui, lui, y aurait accès.
const PROFILE_COLUMNS = "id, name, role, color, password_set, created_at";

export async function getProfiles(supabase: DB): Promise<Profile[]> {
  const { data, error } = await supabase.from("users").select(PROFILE_COLUMNS).order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getProfile(supabase: DB, id: string): Promise<Profile | null> {
  const { data } = await supabase.from("users").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  return data ?? null;
}

interface TaskRow extends Task {
  task_assignees: { users: Profile }[] | null;
}

export async function getTasks(supabase: DB): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(`*, task_assignees(users(${PROFILE_COLUMNS}))`)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);

  return ((data as unknown as TaskRow[]) ?? []).map((row) => ({
    ...row,
    assignees: (row.task_assignees ?? []).map((a) => a.users).filter(Boolean),
  }));
}

export async function getTask(supabase: DB, id: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(`*, task_assignees(users(${PROFILE_COLUMNS}))`)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as TaskRow;
  return {
    ...row,
    assignees: (row.task_assignees ?? []).map((a) => a.users).filter(Boolean),
  };
}

export async function getComments(supabase: DB, taskId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select(`*, author:users(${PROFILE_COLUMNS})`)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as unknown as Comment[]) ?? [];
}

// Utilisé par l'écran de connexion et par setPasswordAction : recherche un
// utilisateur par nom, en incluant cette fois password_hash. Réservé au
// code serveur d'authentification (src/lib/actions.ts) — ne jamais renvoyer
// le résultat de cette fonction tel quel à un composant.
export async function getUserWithPasswordHash(
  supabase: DB,
  id: string
): Promise<(Profile & { password_hash: string }) | null> {
  const { data } = await supabase
    .from("users")
    .select(`${PROFILE_COLUMNS}, password_hash`)
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

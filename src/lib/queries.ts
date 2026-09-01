import type { SupabaseClient } from "@supabase/supabase-js";
import type { Comment, Profile, Tag, Task } from "./types";

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

export async function getTags(supabase: DB): Promise<Tag[]> {
  const { data, error } = await supabase.from("tags").select("id, name").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Récupère l'id de chaque tag nommé, en créant ceux qui n'existent pas
// encore (utilisateur libre de taper un nouveau tag dans le formulaire).
// Les noms sont normalisés (espaces retirés, minuscules) pour éviter les
// doublons du type "Maison" / "maison".
export async function upsertTagIds(supabase: DB, names: string[]): Promise<string[]> {
  const normalized = Array.from(
    new Set(
      names
        .map((n) => n.trim().toLowerCase())
        .filter((n) => n.length > 0)
    )
  );
  if (normalized.length === 0) return [];

  const { error: upsertError } = await supabase
    .from("tags")
    .upsert(
      normalized.map((name) => ({ name })),
      { onConflict: "name", ignoreDuplicates: true }
    );
  if (upsertError) throw new Error(upsertError.message);

  const { data, error } = await supabase.from("tags").select("id, name").in("name", normalized);
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => t.id);
}

interface TaskRow extends Task {
  task_assignees: { users: Profile }[] | null;
  task_tags: { tags: Tag }[] | null;
}

const TASK_SELECT = `*, task_assignees(users(${PROFILE_COLUMNS})), task_tags(tags(id, name))`;

function mapTaskRow(row: TaskRow): Task {
  return {
    ...row,
    assignees: (row.task_assignees ?? []).map((a) => a.users).filter(Boolean),
    tags: (row.task_tags ?? []).map((t) => t.tags).filter(Boolean),
  };
}

export async function getTasks(supabase: DB): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);

  return ((data as unknown as TaskRow[]) ?? []).map(mapTaskRow);
}

export async function getTask(supabase: DB, id: string): Promise<Task | null> {
  const { data, error } = await supabase.from("tasks").select(TASK_SELECT).eq("id", id).maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return mapTaskRow(data as unknown as TaskRow);
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

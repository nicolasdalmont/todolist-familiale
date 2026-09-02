import type { SupabaseClient } from "@supabase/supabase-js";
import type { Comment, Profile, ShareRole, Tag, Task } from "./types";
import { canView } from "./access";

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
  task_assignees: { role: ShareRole; users: Profile }[] | null;
  task_tags: { tags: Tag }[] | null;
}

const TASK_SELECT = `*, task_assignees(role, users(${PROFILE_COLUMNS})), task_tags(tags(id, name))`;

function mapTaskRow(row: TaskRow): Task {
  return {
    ...row,
    assignees: (row.task_assignees ?? [])
      .filter((a) => a.users)
      .map((a) => ({ ...a.users, role: a.role })),
    tags: (row.task_tags ?? []).map((t) => t.tags).filter(Boolean),
  };
}

// Ne renvoie que les tâches visibles par userId : celles qu'il a créées, ou
// pour lesquelles il figure dans task_assignees (quel que soit son rôle).
// Toute tâche privée à quelqu'un d'autre, ou partagée sans lui, est
// exclue — c'est ici que la confidentialité "privée par défaut" est
// appliquée, pas seulement dans l'affichage (voir src/lib/access.ts).
export async function getTasks(supabase: DB, userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);

  const tasks = ((data as unknown as TaskRow[]) ?? []).map(mapTaskRow);
  return tasks.filter((t) => canView(t, userId));
}

// Renvoie la tâche si userId a le droit de la voir (créateur ou partagée
// avec lui), sinon null — la page appelante doit alors se comporter comme
// si la tâche n'existait pas (notFound()), pour ne rien révéler de son
// existence à quelqu'un qui n'y a pas accès.
export async function getTask(supabase: DB, id: string, userId: string): Promise<Task | null> {
  const { data, error } = await supabase.from("tasks").select(TASK_SELECT).eq("id", id).maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const task = mapTaskRow(data as unknown as TaskRow);
  return canView(task, userId) ? task : null;
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

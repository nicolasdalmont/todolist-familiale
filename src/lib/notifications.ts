import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationType } from "./types";
import { sendPushToUser } from "./push";

type DB = SupabaseClient<any, "public", any>;

// Point d'entrée unique pour « prévenir quelqu'un » : crée une notification
// « À ton attention » (fil de l'écran d'accueil, src/components/
// AttentionFeed.tsx) et, si la personne a activé les notifications sur au
// moins un appareil (table push_subscriptions — voir migration
// 007_push_subscriptions.sql), envoie aussi un push web
// (sendPushToUser(), src/lib/push.ts). Sans abonnement, ce second envoi
// est un no-op silencieux — c'est le cas tant que l'écran d'activation
// (« Mon compte ») n'existe pas encore.
//
// Les deux écritures sont volontairement non bloquantes, comme
// logActivity() dans src/lib/actions.ts : une erreur ici (table absente,
// clés VAPID manquantes, etc.) ne doit jamais faire échouer l'action
// principale qui la déclenche.
export async function notifyUser(
  supabase: DB,
  params: {
    userId: string;
    type: NotificationType;
    taskId?: string | null;
    title: string;
    body?: string | null;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from("notifications").insert({
      user_id: params.userId,
      type: params.type,
      task_id: params.taskId ?? null,
      title: params.title,
      body: params.body ?? null,
    });
    if (error) console.error("notifyUser:", error.message);
  } catch (e) {
    console.error("notifyUser:", e);
  }

  await sendPushToUser(supabase, params.userId, {
    title: params.title,
    body: params.body,
    url: params.taskId ? `/tasks/${params.taskId}` : "/",
  });
}

// Notifie tous les participants d'une tâche (créateur + assignés + lecteurs)
// sauf `excludeUserId` — typiquement l'auteur de l'action, qu'on n'informe
// pas de ce qu'il vient de faire lui-même.
export async function notifyTaskParticipants(
  supabase: DB,
  params: {
    taskId: string;
    excludeUserId: string;
    type: NotificationType;
    title: string;
    body?: string | null;
  }
): Promise<void> {
  const [{ data: task }, { data: assignees }] = await Promise.all([
    supabase.from("tasks").select("created_by").eq("id", params.taskId).maybeSingle(),
    supabase.from("task_assignees").select("user_id").eq("task_id", params.taskId),
  ]);
  if (!task) return;

  const recipients = new Set<string>([
    task.created_by,
    ...(assignees ?? []).map((a) => a.user_id as string),
  ]);
  recipients.delete(params.excludeUserId);

  await Promise.all(
    [...recipients].map((userId) =>
      notifyUser(supabase, {
        userId,
        type: params.type,
        taskId: params.taskId,
        title: params.title,
        body: params.body,
      })
    )
  );
}

// Prénom d'un utilisateur, pour composer le texte d'une notification
// (« Virgile a commenté … »). Repli neutre si introuvable.
export async function actorName(supabase: DB, userId: string): Promise<string> {
  const { data } = await supabase.from("users").select("name").eq("id", userId).maybeSingle();
  return data?.name ?? "Quelqu'un";
}

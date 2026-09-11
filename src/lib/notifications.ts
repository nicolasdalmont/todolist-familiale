import { sql } from "./db";
import type { NotificationType } from "./types";
import { sendPushToUser } from "./push";

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
export async function notifyUser(params: {
  userId: string;
  type: NotificationType;
  taskId?: string | null;
  title: string;
  body?: string | null;
}): Promise<void> {
  try {
    await sql`
      insert into notifications (user_id, type, task_id, title, body)
      values (${params.userId}, ${params.type}, ${params.taskId ?? null}, ${params.title}, ${params.body ?? null})
    `;
  } catch (e) {
    console.error("notifyUser:", e instanceof Error ? e.message : e);
  }

  await sendPushToUser(params.userId, {
    title: params.title,
    body: params.body,
    url: params.taskId ? `/tasks/${params.taskId}` : "/",
  });
}

// Notifie tous les participants d'une tâche (créateur + assignés + lecteurs)
// sauf `excludeUserId` — typiquement l'auteur de l'action, qu'on n'informe
// pas de ce qu'il vient de faire lui-même. `excludeUserId` est optionnel :
// omis pour une notification système sans auteur (ex. rappel d'échéance,
// voir /api/cron/reminders), qui doit alors atteindre tout le monde y
// compris le créateur d'une tâche privée.
export async function notifyTaskParticipants(params: {
  taskId: string;
  excludeUserId?: string;
  type: NotificationType;
  title: string;
  body?: string | null;
}): Promise<void> {
  const [taskRows, assigneeRows] = await Promise.all([
    sql`select created_by from tasks where id = ${params.taskId}`,
    sql`select user_id from task_assignees where task_id = ${params.taskId}`,
  ]);
  const task = taskRows[0] as { created_by: string } | undefined;
  if (!task) return;

  const recipients = new Set<string>([
    task.created_by,
    ...(assigneeRows as { user_id: string }[]).map((a) => a.user_id),
  ]);
  if (params.excludeUserId) recipients.delete(params.excludeUserId);

  await Promise.all(
    [...recipients].map((userId) =>
      notifyUser({
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
export async function actorName(userId: string): Promise<string> {
  const rows = await sql`select name from users where id = ${userId}`;
  return (rows[0] as { name: string } | undefined)?.name ?? "Quelqu'un";
}

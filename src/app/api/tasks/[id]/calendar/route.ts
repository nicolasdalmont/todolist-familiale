import { getSessionUserId } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTask } from "@/lib/queries";
import { buildTaskICS } from "@/lib/calendar";

export const dynamic = "force-dynamic";

// Sert le fichier `.ics` d'une tâche datée (voir src/lib/calendar.ts et
// 6.13) : le lien « Ajouter à mon agenda » de l'écran de détail pointe
// ici. L'en-tête `Content-Disposition: attachment` fait ouvrir le fichier
// dans l'application de calendrier par défaut de l'appareil.
//
// Sous le middleware d'authentification (session vérifiée), mais on
// re-contrôle ici l'accès à la tâche elle-même : `getTask()` renvoie
// `null` si `userId` n'a pas le droit de la voir (privée à quelqu'un
// d'autre, ou partagée sans lui) — on répond alors 404, comme si la
// tâche n'existait pas, pour ne rien révéler.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return new Response("Non authentifié", { status: 401 });

  const supabase = createAdminClient();
  const task = await getTask(supabase, params.id, userId);
  if (!task) return new Response("Tâche introuvable", { status: 404 });

  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const taskUrl = host ? `${proto}://${host}/tasks/${task.id}` : undefined;

  const ics = buildTaskICS(task, taskUrl);
  if (!ics) return new Response("Cette tâche n'a pas d'échéance", { status: 404 });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tache.ics"',
      "Cache-Control": "no-store",
    },
  });
}

import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBadgeCount } from "./queries";

type DB = SupabaseClient<any, "public", any>;

// Envoi des notifications push web (protocole standard, RFC 8291/8292 —
// aucun service tiers, aucun compte à créer, voir la feuille de route
// notifications pour le détail). Trois variables d'environnement, générées
// une fois avec `npx web-push generate-vapid-keys` :
//   - NEXT_PUBLIC_VAPID_PUBLIC_KEY : publique par nature (le préfixe
//     NEXT_PUBLIC_ l'expose aussi au client, qui en a besoin pour
//     pushManager.subscribe() — voir l'écran "Mon compte" à venir). Une
//     seule variable pour serveur et client : pas de risque de désaccord
//     entre deux copies de la même clé.
//   - VAPID_PRIVATE_KEY : secrète, signe les requêtes d'envoi.
//   - VAPID_SUBJECT : contact "mailto:..." transmis au service push en cas
//     de souci de délivrabilité — jamais affiché à un utilisateur.
let configured = false;

function ensureConfigured(): void {
  if (configured) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "Clés VAPID manquantes (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT)."
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

// Envoie une notification push à tous les appareils sur lesquels
// `userId` a activé les notifications (une ligne `push_subscriptions` par
// appareil — voir migration 007_push_subscriptions.sql). Best-effort et
// non bloquant, comme le reste de src/lib/notifications.ts : ne lève
// jamais, se contente de logguer. Sans abonnement (notifications pas
// activées, ou pas encore d'écran pour le faire) : no-op silencieux.
//
// Purge automatiquement un abonnement mort (404/410 — endpoint révoqué
// côté navigateur/OS, ex. désinstallation de la PWA) plutôt que de
// continuer à tenter de lui écrire indéfiniment.
export async function sendPushToUser(
  supabase: DB,
  userId: string,
  payload: { title: string; body?: string | null; url?: string }
): Promise<void> {
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  // Table pas encore créée (migration 007 pas encore appliquée), ou
  // erreur de lecture : dégrade en no-op, comme getRecentActivity().
  if (error || !subs || subs.length === 0) return;

  try {
    ensureConfigured();
  } catch (e) {
    console.error("sendPushToUser:", e);
    return;
  }

  // Compte à afficher sur la pastille de l'icône (voir getBadgeCount(),
  // src/lib/queries.ts, et le handler "push" de public/sw.js) : notifs non
  // lues + tâches en retard, à l'instant de cet envoi. Best-effort — si le
  // calcul échoue, le service worker se rabat sur un indicateur générique
  // (setAppBadge() sans argument) plutôt que de bloquer l'envoi du push.
  const badgeCount = await getBadgeCount(supabase, userId).catch(() => undefined);

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body ?? undefined,
    url: payload.url ?? "/",
    badgeCount,
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("sendPushToUser:", sub.id, err instanceof Error ? err.message : err);
        }
      }
    })
  );
}

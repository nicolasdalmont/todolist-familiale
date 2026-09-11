import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { sql } from "@/lib/db";

// Enregistre / désenregistre l'abonnement push web de l'appareil courant
// (table push_subscriptions, migration 007_push_subscriptions.sql). Route
// Handler plutôt que Server Action : appelée aussi bien depuis le
// composant client NotificationsToggle.tsx (bouton "Activer/Désactiver
// les notifications" sur l'écran "Mon compte") que depuis public/sw.js
// (handler "pushsubscriptionchange"), qui tourne hors du runtime React et
// ne peut invoquer aucune Server Action.
//
// Exclue du middleware d'authentification (voir src/middleware.ts, même
// raison que /api/version) : une redirection HTTP vers /login casserait
// un fetch() qui attend du JSON. La vérification de session se fait donc
// directement ici, avec un simple 401 JSON en son absence.

interface SubscriptionBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  userAgent?: string;
}

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as SubscriptionBody | null;
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  const userAgent = typeof body?.userAgent === "string" ? body.userAgent.slice(0, 300) : null;

  try {
    await sql`
      insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
      values (${userId}, ${endpoint}, ${p256dh}, ${auth}, ${userAgent})
      on conflict (endpoint) do update
      set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent
    `;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  const endpoint = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "missing endpoint" }, { status: 400 });

  // Filtré aussi par user_id : un utilisateur ne peut supprimer que ses
  // propres abonnements, même s'il connaissait l'endpoint de quelqu'un
  // d'autre.
  await sql`delete from push_subscriptions where endpoint = ${endpoint} and user_id = ${userId}`;

  return NextResponse.json({ ok: true });
}

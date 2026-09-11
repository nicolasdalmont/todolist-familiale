import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getAppSettings } from "@/lib/queries";
import { notifyTaskParticipants } from "@/lib/notifications";
import { dateKeyFromDate, dateKeyFromIso, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Rappel quotidien des tâches dues aujourd'hui (jour civil de l'appli —
// voir src/lib/timezone.ts), déclenché une fois par jour par Vercel Cron
// (voir vercel.json). Peut être coupé depuis l'onglet « Réglages » de
// l'admin (app_settings.reminder_enabled, migration 010) sans redéployer.
// L'heure du déclenchement, elle, est le `schedule` du cron (Vercel Hobby
// ne permet pas plus d'un déclenchement par jour). Notifie chaque participant
// (créateur + assigné(e)s — notifyTaskParticipants(), src/lib/
// notifications.ts, in-app + push), y compris sur une tâche privée : ce
// n'est pas l'action d'un autre membre dont on informe les participants,
// mais un rappel adressé à chacun individuellement.
//
// Un garde-fou évite un doublon si Vercel retentait l'appel le même jour :
// on ne notifie une tâche que si aucune notification "due_soon" n'a déjà
// été créée pour elle dans les dernières 20h (marge large plutôt qu'un
// calcul de minuit civil, le cron ne tournant qu'une fois par jour).
//
// Protégée par CRON_SECRET (voir src/middleware.ts, /api/cron exclu de la
// vérification de session — comme /api/version et /api/push, ceci n'est
// pas appelé par un navigateur) : Vercel Cron ajoute automatiquement
// l'en-tête "Authorization: Bearer <CRON_SECRET>" quand cette variable est
// définie sur le projet.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getAppSettings();
  if (!settings.reminderEnabled) {
    return NextResponse.json({ ok: true, skipped: "reminder disabled" });
  }

  const todayKey = dateKeyFromDate(new Date());

  let tasks: { id: string; title: string; due_at: string }[];
  try {
    tasks = (await sql`
      select id, title, due_at from tasks
      where due_at is not null and status in ('todo', 'in_progress')
    `) as { id: string; title: string; due_at: string }[];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("cron/reminders:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const dueToday = tasks.filter((t) => dateKeyFromIso(t.due_at) === todayKey);
  const recentCutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

  let notified = 0;
  for (const task of dueToday) {
    const alreadySentRows = await sql`
      select count(*)::int as n from notifications
      where task_id = ${task.id} and type = 'due_soon' and created_at >= ${recentCutoff}
    `;
    const alreadySent = (alreadySentRows[0] as { n: number } | undefined)?.n ?? 0;
    if (alreadySent > 0) continue;

    await notifyTaskParticipants({
      taskId: task.id,
      type: "due_soon",
      title: `« ${task.title} » échoit aujourd'hui`,
      body: `Échéance : ${formatDate(task.due_at)}`,
    });
    notified++;
  }

  return NextResponse.json({ ok: true, dueToday: dueToday.length, notified });
}

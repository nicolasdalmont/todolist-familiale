import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTaskParticipants } from "@/lib/notifications";
import { dateKeyFromDate, dateKeyFromIso, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Rappel quotidien des tâches dues aujourd'hui (jour civil de Paris — voir
// src/lib/timezone.ts), déclenché par Vercel Cron (voir vercel.json,
// 07:00 UTC ≈ 8-9h à Paris selon la saison). Notifie chaque participant
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

  const supabase = createAdminClient();
  const todayKey = dateKeyFromDate(new Date());

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, title, due_at")
    .not("due_at", "is", null)
    .in("status", ["todo", "in_progress"]);
  if (error) {
    console.error("cron/reminders:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dueToday = (tasks ?? []).filter((t) => dateKeyFromIso(t.due_at as string) === todayKey);
  const recentCutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

  let notified = 0;
  for (const task of dueToday) {
    const { count: alreadySent } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("task_id", task.id)
      .eq("type", "due_soon")
      .gte("created_at", recentCutoff);
    if (alreadySent && alreadySent > 0) continue;

    await notifyTaskParticipants(supabase, {
      taskId: task.id,
      type: "due_soon",
      title: `« ${task.title} » échoit aujourd'hui`,
      body: `Échéance : ${formatDate(task.due_at as string)}`,
    });
    notified++;
  }

  return NextResponse.json({ ok: true, dueToday: dueToday.length, notified });
}

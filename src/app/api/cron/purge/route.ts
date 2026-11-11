import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

// Purge quotidienne (Vercel Cron, voir vercel.json) des tâches terminées
// depuis plus de 3 mois (tasks.completed_at, migration 012). Les
// assignations, commentaires, notifications, tags et éléments de checklist
// partent avec elles (on delete cascade) ; les activités d'agenda ne
// sont pas touchées. Le streak (user_activity_log) n'est pas touché.
//
// Protégée par CRON_SECRET, comme /api/cron/reminders.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const rows = await sql`
      delete from tasks
      where status = 'done'
        and completed_at is not null
        and completed_at < now() - interval '3 months'
      returning id
    `;
    return NextResponse.json({ ok: true, purged: rows.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("cron/purge:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

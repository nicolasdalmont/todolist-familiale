import { NextResponse } from "next/server";
import { getProfile, getTasks, getUserActiveDays } from "@/lib/queries";
import { computeStreak } from "@/lib/streaks";
import { canEdit } from "@/lib/access";
import { dateKeyFromDate, dateKeyFromIso, isOverdue } from "@/lib/format";

export const dynamic = "force-dynamic";

// Endpoint en lecture seule pour un widget iPhone (Scriptable), voir
// scriptable/family-todolist-widget.js. Volontairement séparé du cookie de
// session principal (src/lib/auth.ts) : un jeton qui vit dans une app tierce
// sur le téléphone doit pouvoir être révoqué (en changeant WIDGET_TOKEN) sans
// déconnecter personne, et ne doit donner accès qu'en lecture à un seul
// profil (WIDGET_PROFILE_ID) plutôt qu'un accès complet à toute l'appli —
// même principe que CRON_SECRET pour /api/cron/reminders.
//
// Reprend exactement les mêmes règles de calcul que l'écran d'accueil
// (src/app/page.tsx + src/components/HomeDashboard.tsx) pour que les
// chiffres du widget correspondent à ceux vus dans l'app : compteurs
// "mine" + "open" filtrés par canEdit()/isOverdue(), streak sur 400 jours
// glissants.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = process.env.WIDGET_TOKEN;
  const profileId = process.env.WIDGET_PROFILE_ID;
  if (!token || !profileId || authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await getProfile(profileId);
  if (!profile) {
    return NextResponse.json({ error: "profil introuvable" }, { status: 404 });
  }

  const tasks = await getTasks(profile.id);
  const mine = tasks.filter((t) => canEdit(t, profile.id));
  const open = mine.filter((t) => t.status === "todo" || t.status === "in_progress");

  const todayKey = dateKeyFromDate(new Date());
  const todayCount = open.filter((t) => t.due_at && dateKeyFromIso(t.due_at) === todayKey).length;
  const overdueCount = mine.filter((t) => isOverdue(t.due_at, t.status)).length;

  const activeDaysSinceIso = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
  const streak = computeStreak(await getUserActiveDays(profile.id, activeDaysSinceIso), todayKey);

  return NextResponse.json({
    profileName: profile.name,
    todayCount,
    overdueCount,
    streak,
    updatedAt: new Date().toISOString(),
  });
}

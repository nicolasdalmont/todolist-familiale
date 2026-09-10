import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

// Middleware Edge : vérifie uniquement la signature du cookie de session
// (JWT), sans appel réseau vers Supabase — l'authentification ne repose
// plus sur Supabase Auth mais sur une table "users" maison, interrogée
// uniquement côté Server Components/Actions via la clé service_role.
const SESSION_COOKIE = "session";

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET manquant dans les variables d'environnement.");
  }
  return new TextEncoder().encode(secret);
}

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  try {
    await jwtVerify(token, getSecretKey());
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const authenticated = await hasValidSession(request);
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");

  if (!authenticated && !isAuthRoute) {
    const url = request.nextUrl.clone();
    // Conserve la destination demandée pour y revenir après connexion
    // (audit UX UX-6) — utile quand on ouvre un lien profond, p. ex.
    // depuis une notification push qui pointe vers /tasks/<id>.
    const target = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/login";
    url.search = "";
    if (target && target !== "/") url.searchParams.set("next", target);
    return NextResponse.redirect(url);
  }

  if (authenticated && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // /api/version exclu : c'est un simple repère de version interrogé par
  // AppUpdateWatcher.tsx pour détecter un nouveau déploiement, y compris
  // depuis l'écran de connexion (pas encore de session) — pas de raison de
  // le faire passer par la vérification de session, ni de risquer qu'une
  // redirection vers /login casse la réponse JSON attendue côté client.
  //
  // /api/push exclu pour la même raison : POST/DELETE
  // /api/push/subscribe (voir src/app/api/push/subscribe/route.ts) est
  // aussi appelée depuis public/sw.js (handler "pushsubscriptionchange"),
  // hors du contexte d'un onglet navigateur — la vérification de session
  // s'y fait directement (401 JSON si absente), pas via une redirection.
  //
  // /api/cron exclu de même : /api/cron/reminders (voir vercel.json) est
  // appelée par Vercel Cron, jamais par un navigateur — aucun cookie de
  // session à vérifier, la route s'authentifie elle-même via CRON_SECRET.
  //
  // /api/session exclu : /api/session/end efface le cookie et redirige
  // vers /login — le faire passer par le middleware, qui verrait encore un
  // JWT signé valide, le renverrait vers `/` et empêcherait le nettoyage.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|icon.png|icons|manifest.json|sw.js|api/version|api/push|api/cron|api/session).*)",
  ],
};

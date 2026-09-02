import { NextResponse } from "next/server";

// Petit repère de version, interrogé côté client par AppUpdateWatcher.tsx
// pour détecter qu'un nouveau déploiement a eu lieu pendant qu'un onglet (ou
// la PWA installée sur l'écran d'accueil) était resté ouvert, et déclencher
// un rechargement automatique — voir ce composant pour le détail du
// problème que ça résout (une page déjà chargée continue de faire tourner
// l'ancien code JS indéfiniment, rien ne la pousse toute seule à recharger).
//
// VERCEL_GIT_COMMIT_SHA est injectée automatiquement par Vercel à chaque
// build, sans configuration ni variable d'environnement à créer soi-même —
// elle change à chaque déploiement, ce qui en fait un identifiant de
// version fiable. En local (pas de déploiement Vercel), on retombe sur un
// identifiant fixe calculé une fois au démarrage du process : suffisant
// pour ne jamais déclencher de rechargement intempestif en développement.
const FALLBACK_BUILD_ID = `dev-${Date.now()}`;
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || FALLBACK_BUILD_ID;

// Repère de version, jamais mis en cache nulle part (voir aussi le
// fetch("/api/version", { cache: "no-store" }) côté client) : c'est ce qui
// garantit qu'un onglet resté ouvert compare toujours sa version chargée à
// la version réellement en train de tourner sur le serveur, jamais à un
// instantané périmé de cette comparaison elle-même.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { buildId: BUILD_ID },
    { headers: { "Cache-Control": "no-store, must-revalidate" } }
  );
}

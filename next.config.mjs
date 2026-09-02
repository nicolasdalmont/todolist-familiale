/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Désactive le cache de navigation côté client (Client Router Cache)
    // pour les routes rendues dynamiquement. Par défaut, Next.js réutilise
    // pendant 30s le rendu déjà récupéré pour une URL visitée via <Link>
    // (ex. les onglets de filtre du tableau de bord, qui changent juste le
    // "?filter=" de "/"), même si le serveur a des données plus fraîches —
    // symptôme observé le 01/09/2026 : après avoir créé/modifié une tâche
    // (ou changé de statut) puis changé d'onglet, l'affichage restait figé
    // jusqu'à un rechargement complet de la page. Ce cache est distinct du
    // Data Cache de fetch() déjà neutralisé dans src/lib/supabase/admin.ts
    // (voir notes du projet) : il vit uniquement dans le navigateur et
    // n'était pas couvert par ce premier correctif. Le mettre à 0 force une
    // requête fraîche au serveur à chaque navigation "douce" (Link,
    // router.push, retour arrière) vers une route dynamique.
    staleTimes: {
      dynamic: 0,
    },
  },
  // Empêche le navigateur (et le CDN Vercel) de mettre en cache sw.js
  // lui-même : sans ça, un nouveau déploiement du service worker (ex. le
  // correctif du 02/09/2026, v1 → v2 — voir public/sw.js) peut mettre
  // jusqu'à 24h à être détecté par les navigateurs déjà installés, qui
  // continueraient entre-temps à servir les pages depuis l'ancien cache
  // fautif.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;

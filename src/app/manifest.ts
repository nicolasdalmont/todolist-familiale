import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/app-config";

// Manifest PWA généré (au lieu d'un public/manifest.json figé) pour que le
// nom suive NEXT_PUBLIC_APP_NAME sur un déploiement personnalisé. Servi
// sur /manifest.webmanifest ; Next ajoute automatiquement le
// <link rel="manifest">.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Gestion de tâches partagées en famille.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#d6336c",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

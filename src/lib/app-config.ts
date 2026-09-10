// Réglages d'instance fixés au déploiement (variables d'environnement,
// inline au build — modifiables ensuite via un redéploiement). Voir aussi
// APP_TIMEZONE dans src/lib/timezone.ts, et la section « Réglages » de
// l'écran admin (informations d'instance).
export { APP_TIMEZONE } from "./timezone";

// Nom affiché de l'application (titre d'onglet, barre supérieure, écran de
// connexion, manifest PWA, PRODID des fichiers .ics). Par défaut
// « Checkberry ». Configurable via NEXT_PUBLIC_APP_NAME.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Checkberry";

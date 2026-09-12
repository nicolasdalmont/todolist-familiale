# Checkberry

Application web responsive de gestion de tâches partagées en famille
(anciennement « To-Do List Familiale » ; dépôt toujours
`todolist-familiale`) — Next.js (App Router) + Neon (Postgres serverless)
+ Vercel (hébergement).

Ce dépôt est développé par Claude Code depuis une copie locale : lecture,
modification, vérification (`tsc`/`build`) et `git commit`/`push` directs
sur `main`, chaque push déclenchant un déploiement Vercel production (voir
"Développement local" ci-dessous et la doc technique §10). La base tournait
jusqu'au 11/09/2026 sur Supabase, migrée depuis vers Neon — voir
`docs/migration-neon.md` pour le détail.

## Pile technique

- **Next.js 14** (App Router, TypeScript, Tailwind CSS)
- **Neon** : Postgres serverless, connexion directe en SQL paramétré via
  `@neondatabase/serverless` (pas d'ORM, pas de query-builder) — voir
  "Schéma de base de données" ci-dessous
- **Vercel** : build et hébergement, déploiement continu sur chaque push

## Authentification

L'authentification est entièrement maison : une table `users` (voir
"Schéma de base de données" ci-dessous) stocke un prénom et un mot de passe
haché (algorithme scrypt, module `crypto` intégré à Node.js — aucune
dépendance externe). Next.js se connecte à Neon exclusivement côté serveur
avec la chaîne `DATABASE_URL`, en propriétaire de la base — aucune notion
de policy/Row Level Security à gérer côté Neon (l'appli n'est jamais
jointe depuis le navigateur).

La session est portée par un cookie HTTP-only contenant un JWT signé
(bibliothèque `jose`), vérifié dans le middleware Next.js (Edge runtime)
sans appel réseau à la base.

- **Connexion.** L'écran affiche les membres de la famille (prénom +
  avatar) ; on clique sur son profil puis on entre son mot de passe.
- **Création de compte** : depuis l'application, avec un compte
  administrateur → onglet **Admin → « Membres » → « Ajouter un membre »**
  (prénom, rôle, mot de passe temporaire généré). Voir la doc technique
  §6.9. Seul le tout premier administrateur est créé hors application
  (bootstrap ci-dessous).
- **Première connexion** : l'utilisateur choisit son profil, entre le mot
  de passe temporaire, puis définit immédiatement son propre mot de passe
  dans le même écran. `password_set` passe alors à `true`.
- **Changer son mot de passe** : soit depuis l'écran de connexion (lien
  "Changer mon mot de passe", après avoir choisi son profil), soit une fois
  connecté depuis l'écran "Mon compte" (clic sur son avatar). Les deux
  demandent le mot de passe actuel puis le nouveau.
- **Mot de passe oublié** : un administrateur clique « Réinitialiser le
  mot de passe » sur la fiche du membre (onglet « Membres ») — un nouveau
  mot de passe temporaire est généré et le membre retombe sur l'écran de
  première connexion.

### Bootstrap : premier compte administrateur

`db/neon_schema.sql` crée automatiquement un premier utilisateur `Admin`
avec le mot de passe temporaire **`bonjour2026`**. Se connecter avec ce
compte, définir immédiatement un mot de passe personnel via l'écran de
première connexion, puis créer les autres membres depuis l'onglet
**Admin → « Membres »**.

## Variables d'environnement

À définir dans Vercel (Project Settings → Environment Variables, voir
`.env.example`) :

```
DATABASE_URL=
SESSION_SECRET=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
CRON_SECRET=
```

`DATABASE_URL` est la chaîne de connexion **pooled** Neon (dashboard Neon
→ Connection Details, host en `...-pooler...`) — strictement secrète,
jamais exposée au navigateur. Une rotation du mot de passe Neon invalide
toute la chaîne (pas seulement le mot de passe isolé) : après une
rotation, toujours régénérer `DATABASE_URL` en entier depuis le dashboard
plutôt que de tenter un montage manuel.

`SESSION_SECRET` est une chaîne aléatoire longue à générer soi-même (ex.
`openssl rand -base64 48`) : elle signe les cookies de session, donc la
garder secrète et ne jamais la changer sans effet de bord (tout
changement déconnecte tous les utilisateurs).

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` sont la paire de clés
des notifications push web (protocole standard, aucun compte/service tiers
à créer) — à générer une fois avec `npx web-push generate-vapid-keys` et à
garder ensuite, ne pas régénérer (ça invaliderait tous les abonnements déjà
enregistrés). `VAPID_SUBJECT` est un contact `mailto:...` transmis au
service push en cas de souci de délivrabilité, jamais affiché aux
utilisateurs. `CRON_SECRET` protège la route de rappel d'échéance
(`/api/cron/reminders`, voir `vercel.json`) — Vercel Cron l'ajoute
automatiquement en en-tête `Authorization` à ses appels dès que cette
variable est définie sur le projet ; à générer une fois
(ex. `openssl rand -base64 32`). Toutes en type **Secret**, sauf
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` qui doit rester en clair (le préfixe
`NEXT_PUBLIC_` l'expose intentionnellement au navigateur).

## Schéma de base de données

Structure complète et à jour : `db/neon_schema.sql` (exécutable, réservé
à la reconstruction d'un environnement — voir la documentation technique
§5.3). Évolutions postérieures : `db/migrations/` (scripts additifs
numérotés, à exécuter à la main sur Neon). Tables : `users`, `tasks`,
`task_assignees` (partage multiple, avec rôle), `comments`, `categories`,
`app_settings`, `tags`/`task_tags`, `checklist_items`, `activity_log`,
`user_activity_log` (streak personnel), `reward_tiers`,
`challenge_results`, `reward_achievements` (paliers de récompense),
`notifications`, `push_subscriptions`.
Aucune notion de policy/Row Level Security côté Neon : l'application se
connecte en propriétaire de la base (`DATABASE_URL`) ; la visibilité
partagée/privée est appliquée entièrement au niveau applicatif
(`src/lib/access.ts`).

## Fonctionnement

- Toute nouvelle tâche est assignée automatiquement à son créateur.
- Une tâche récurrente clôturée ("Terminée") régénère automatiquement la
  prochaine occurrence avec les mêmes assignations.
- Visibilité privée par défaut, partage explicite par personne avec un
  rôle (assigné / lecture seule) — filtré côté application.
- Écran d'accueil : deux fils distincts — « À ton attention » (ce qui te
  concerne et attend peut-être une action, notifié) et « Activité du
  jour » (ce que fait la famille) — plus « Partagées avec toi » (les
  tâches où tu es en lecture seule). Notifications push web (opt-in par
  appareil, écran « Mon compte ») + rappel d'échéance quotidien (Vercel
  Cron). Voir la doc technique §6.15 et §6.16.
- Export d'une tâche datée vers le calendrier de l'appareil (fichier
  `.ics`). Voir §6.13.
- Gamification (12/09/2026, en test) : streak personnel (jours actifs
  consécutifs, une grâce par semaine) affiché sur l'accueil, « Mon
  compte » et l'onglet Membres de l'admin, plus une carte « Défi de la
  semaine » sur l'accueil (objectif familial hebdomadaire calculé sur les
  tâches partagées). Voir la doc technique §6.17.
- Paliers de récompense (12/09/2026) : seuils configurables par l'admin
  (onglet Admin → « Récompenses ») sur le streak personnel ou les défis
  familiaux réussis cumulés, chacun associé à une récompense en texte
  libre négociée en famille (pas de monnaie virtuelle). Suivi en
  attente/donné géré par l'admin ; affiché sur l'accueil une fois atteint.
  Voir la doc technique §6.18.
- Toutes les heures sont gérées en fuseau **Europe/Paris**. Voir §8.1.
- Sur mobile : navigation par une barre d'onglets en bas d'écran
  (Accueil · Tâches · Créer · Compte) et « tirer pour rafraîchir » ; sur
  desktop, navigation par le bandeau supérieur. Suite d'améliorations UX
  du 10/09/2026 (24 constats) : voir §6.16.

## Ce qui n'est pas encore implémenté

- Offline-first réel (file d'attente IndexedDB + réconciliation à la
  reconnexion) — le service worker gère le cache de l'app shell et les
  notifications push, pas les mutations créées hors-ligne.

## Développement local

C'est le flux de travail retenu pour ce projet (voir doc technique §10) :
Claude Code travaille sur une copie locale du dépôt, `git commit`/`push`
directement sur `main` — chaque push déclenche un déploiement Vercel
production, la vérification (voir ci-dessous) se fait donc *avant* de
pousser.

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs (voir "Variables d'environnement")
npm run dev
```

Avec `DATABASE_URL` renseignée, `npm run dev` fonctionne contre la vraie
base Neon (pas de base de dev séparée). Avant de pousser sur `main` :
`npx tsc --noEmit` puis `npm run build` — tuer `next dev` avant le build
(les deux écrivent dans `.next`, qui peut se corrompre sinon).

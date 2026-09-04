# To-Do List Familiale

Application web responsive de gestion de tâches partagées en famille —
Next.js (App Router) + Supabase (base de données Postgres uniquement) +
Vercel (hébergement).

Ce dépôt a été écrit par Claude depuis une session cloud (pas de clone local
dans le flux de travail retenu pour ce projet) et poussé sur GitHub via
l'interface web — voir le guide de mise en route (GitHub / Supabase /
Vercel) partagé en artifact dans la conversation pour le détail des étapes.

## Pile technique

- **Next.js 14** (App Router, TypeScript, Tailwind CSS)
- **Supabase** : utilisé uniquement comme base Postgres hébergée (pas
  Supabase Auth — voir "Authentification" ci-dessous)
- **Vercel** : build et hébergement, déploiement continu sur chaque push

## Authentification

L'authentification est entièrement maison, sans Supabase Auth : une table
`users` (voir `supabase/recreate_full_schema.sql`) stocke un prénom et un mot de passe
haché (algorithme scrypt, module `crypto` intégré à Node.js — aucune
dépendance externe). Next.js accède à Supabase exclusivement côté serveur
avec la clé **service_role**, qui contourne Row Level Security ; RLS reste
activé sur toutes les tables mais sans aucune policy, ce qui bloque tout
accès par la clé publique `anon` en cas de fuite.

La session est portée par un cookie HTTP-only contenant un JWT signé
(bibliothèque `jose`), vérifié dans le middleware Next.js (Edge runtime)
sans appel réseau à Supabase.

- **Connexion.** L'écran affiche les membres de la famille (prénom +
  avatar) ; on clique sur son profil puis on entre son mot de passe.
- **Création de compte (administrateur)** : ajouter une ligne dans la table
  `users` via le SQL Editor de Supabase, avec `password_set = false` et un
  `password_hash` correspondant à un mot de passe temporaire. Comme il n'y
  a pas encore d'interface d'administration dans l'application (voir
  ci-dessous), c'est actuellement la seule façon de créer un compte : le
  plus simple est de dupliquer la ligne de bootstrap de
  `supabase/recreate_full_schema.sql` en changeant `name`, ou de redemander à Claude de
  précalculer un hash pour un nouveau mot de passe temporaire.
- **Première connexion** : l'utilisateur choisit son profil, entre le mot
  de passe temporaire, puis définit immédiatement son propre mot de passe
  dans le même écran. `password_set` passe alors à `true`.
- **Changer son mot de passe** : soit depuis l'écran de connexion (lien
  "Changer mon mot de passe", après avoir choisi son profil), soit une fois
  connecté depuis l'écran "Mon compte" (clic sur son avatar). Les deux
  demandent le mot de passe actuel puis le nouveau.
- **Mot de passe oublié** : l'administrateur redéfinit un
  `password_hash` temporaire directement en base (SQL Editor Supabase) et
  repasse `password_set` à `false` — l'utilisateur retombe alors sur
  l'écran de première connexion.

### Bootstrap : premier compte administrateur

`supabase/recreate_full_schema.sql` crée automatiquement un premier
utilisateur `Admin` avec le mot de passe temporaire **`bonjour2026`**. Se
connecter avec ce compte puis définir immédiatement un mot de passe
personnel via l'écran de première connexion.

## Variables d'environnement

À définir dans Vercel (Project Settings → Environment Variables, voir
`.env.example`) :

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_SECRET=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` viennent de Supabase → Project
Settings → API (la clé `service_role`, pas `anon`). `SESSION_SECRET` est une
chaîne aléatoire longue à générer soi-même (ex. `openssl rand -base64 48`) :
elle signe les cookies de session, donc la garder secrète et ne jamais la
changer sans effet de bord (tout changement déconnecte tous les
utilisateurs).

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` sont la paire de clés
des notifications push web (protocole standard, aucun compte/service tiers
à créer) — à générer une fois avec `npx web-push generate-vapid-keys` et à
garder ensuite, ne pas régénérer (ça invaliderait tous les abonnements déjà
enregistrés). `VAPID_SUBJECT` est un contact `mailto:...` transmis au
service push en cas de souci de délivrabilité, jamais affiché aux
utilisateurs. Toutes les six en type **Secret**, sauf
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` qui doit rester en clair (le préfixe
`NEXT_PUBLIC_` l'expose intentionnellement au navigateur).

## Schéma de base de données

Structure complète et à jour : `supabase/recreate_full_schema.sql`
(exécutable, réservé à la reconstruction d'un environnement — voir la
documentation technique §5.3). Évolutions successives appliquées sur la
base réelle : `supabase/migrations/` (scripts additifs numérotés). Tables
principales : `users`, `tasks`, `task_assignees` (partage multiple, avec
rôle), `comments`, `tags`/`task_tags`, `checklist_items`, `activity_log`.
RLS est activé sur toutes les tables mais sans policy : tout accès légitime
passe par le serveur Next.js via la clé service_role ; la visibilité
partagée/privée est appliquée au niveau applicatif (`src/lib/access.ts`),
pas par RLS.

## Fonctionnement

- Toute nouvelle tâche est assignée automatiquement à son créateur.
- Une tâche récurrente clôturée ("Terminée") régénère automatiquement la
  prochaine occurrence avec les mêmes assignations.
- Visibilité partagée (visible par tous) ou privée (visible uniquement par
  le créateur), filtrée côté application.

## Ce qui n'est pas encore implémenté

Conformément au phasage du cahier des charges, restent à construire :

- Offline-first réel (file d'attente IndexedDB + réconciliation à la
  reconnexion) — le service worker actuel ne fait que mettre en cache
  l'app shell.
- Notifications Web Push et App Badge (nécessitent des clés VAPID et une
  fonction serveur d'envoi).
- Interface d'administration pour la création de comptes (actuellement
  faite directement en SQL dans Supabase).

## Développement local (optionnel)

Le flux de travail retenu pour ce projet ne repose pas sur une copie
locale — Claude modifie le code depuis sa session cloud et le dépôt GitHub
est mis à jour via l'upload web. Si tu veux malgré tout lancer le projet en
local (ex : sur une machine ayant accès à npm) :

```bash
npm install
cp .env.example .env.local   # puis renseigner les trois valeurs
npm run dev
```

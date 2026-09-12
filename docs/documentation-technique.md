# Checkberry — Documentation technique

*(anciennement « To-Do List Familiale » ; dépôt GitHub toujours
`nicolasdalmont/todolist-familiale`.)*

Dernière mise à jour : 10/09/2026. Lots de ce jour : **gestion des
comptes depuis l'écran admin** (6.9 — créer / réinitialiser / supprimer
un membre, onglet « Membres » ; migration `008_user_management.sql`) et
**suite d'audit UX complète** (6.16, 24 constats traités) — barre
d'onglets mobile, tirer pour rafraîchir, toasts, confirmation /
suppression annulable, pages système à la marque, retour à la destination
après connexion (`?next=`), raccourcis d'échéance, cohérence des tuiles et
des deux fils de l'accueil, fil « Partagées avec toi », accessibilité
(focus, `aria-label`, `aria-pressed`, `<time>`), zones sûres iOS,
salutation selon l'heure.

Lot du 04/09/2026 : **renommage en
« Checkberry » + nouveau thème rose framboise sur fond blanc** (9),
passage de l'appli en fuseau Europe/Paris de bout en bout (8.1), écran
« Mon compte »
+ changement de mot de passe connecté (6.14), système de notifications
complet — fil in-app « À ton attention » + push web opt-in + rappel
d'échéance quotidien via Vercel Cron (6.15), export d'une tâche vers le
calendrier de l'appareil en `.ics` générique (6.13, remplace un lien
spécifique à Google Agenda), portée « Uniquement mes tâches » alignée sur
`canEdit` + résumé texte des filtres quand le volet est replié (6.7),
séparation des vignettes assigné(e)s / lecture seule (6.1). Avant ça,
même jour : script de reconstruction intégrale de la base (5.3),
compteurs et fil d'activité de l'écran d'accueil (6.6), rationalisation
des filtres (6.7).
Ce document décrit l'application telle qu'elle existe à ce jour (dépôt
`nicolasdalmont/todolist-familiale`) : pile technique, architecture,
modèle de données, fonctionnalités, écrans, et points d'attention connus.
Il complète le `README.md` (installation, variables d'environnement) et
`claude/prototype-notes.md` dans le Projet Claude (journal chronologique
des décisions et des correctifs).

## 1. Vue d'ensemble

Application web responsive (PWA installable) de gestion de tâches
partagées en famille. Chaque membre de la famille dispose d'un profil
(prénom + mot de passe personnel). Chaque tâche est **privée par défaut**
(visible uniquement par son créateur) et peut être partagée avec des
personnes choisies individuellement, avec deux niveaux d'accès (voir
section 6.1). Les tâches sont classées par catégorie, taguées librement,
planifiées avec une échéance et une récurrence, et commentées. Un écran
d'accueil résume les tâches à traiter en priorité et affiche un fil de
notifications « À ton attention » (voir 6.15), doublé de **notifications
push** opt-in par appareil. Chaque tâche datée peut être exportée vers le
calendrier de l'appareil (fichier `.ics`, voir 6.13). Toutes les heures
sont gérées en fuseau Europe/Paris (voir 8.1).

## 2. Pile technique

| Couche | Choix | Rôle |
|---|---|---|
| Framework | Next.js 14.2.35 (App Router, TypeScript) | Rendu serveur, routage, Server Actions |
| UI | React 18.3.1, Tailwind CSS 3.4 | Composants, style |
| Base de données | Neon (Postgres serverless, driver HTTP) | Stockage — connexion directe en SQL, propriétaire de la base |
| Authentification | Maison (`src/lib/auth.ts`) | Table `users`, hash scrypt, cookie JWT (`jose`) |
| Hébergement | Vercel | Build + déploiement continu ; **Vercel Cron** (`vercel.json`) pour le rappel d'échéance (6.15) |
| PWA | `manifest.json` + `public/sw.js` | Installabilité, cache de l'app shell, réception des notifications push (6.15) |
| Push | `web-push` (`jose` déjà présent pour le JWT de session) | Envoi Web Push standard (VAPID), aucun service tiers (6.15) |

Aucune dépendance d'UI framework (pas de librairie de composants) ni d'ORM :
les requêtes passent directement par `@neondatabase/serverless` en SQL
paramétré (tag template). Dépendances runtime : `next`, `react`,
`react-dom`, `@neondatabase/serverless`, `jose`, `web-push`.

> **Migration Supabase → Neon (11/09/2026).** L'application tournait
> jusque-là sur Supabase, utilisé uniquement comme base Postgres hébergée
> (pas Supabase Auth, requêtes via le query-builder PostgREST
> `@supabase/supabase-js`). Elle tourne depuis sur Neon, un Postgres
> serverless piloté par une seule variable `DATABASE_URL` — objectif :
> une appli déployable sur n'importe quel Postgres standard (voir
> `docs/migration-neon.md` pour le détail des 7 phases). Le dossier
> `supabase/` reste dans le dépôt le temps d'une période d'observation
> (nettoyage prévu en Phase 6, ~25/09/2026) mais n'est plus utilisé par le
> code.

## 3. Architecture générale

```
Navigateur ── HTTPS ──> Vercel (Next.js, App Router)
                          ├─ Middleware Edge : vérifie le cookie JWT
                          ├─ Server Components : lisent Neon (sql`` de src/lib/db.ts)
                          │    et filtrent l'accès via src/lib/access.ts
                          └─ Server Actions ("use server") : écrivent dans Neon
                                          │    après vérification d'accès (access.ts)
                                          ▼
                                   Neon Postgres
                              (connexion DATABASE_URL,
                               propriétaire de la base)
```

Points clés :

- **Neon n'est qu'une base Postgres hébergée**, interrogée en SQL brut
  paramétré — pas de query-builder, pas de Data API. `src/lib/db.ts`
  exporte `sql` (`neon(process.env.DATABASE_URL, { fetchOptions: { cache:
  "no-store" } })`), utilisé partout ailleurs par tag template
  (`` await sql`select ... where id = ${id}` ``, paramétré) ou
  `sql.query(text, params)` pour le SQL construit dynamiquement. La
  chaîne `DATABASE_URL` (avec identifiants) ne vit que côté serveur,
  jamais exposée au navigateur.
- **Aucune notion de policy/RLS côté Neon** : l'application se connecte en
  propriétaire de la base (`DATABASE_URL`), il n'y a ni rôle restreint ni
  Row Level Security à gérer — contrairement à Supabase (RLS activé sans
  policy, contourné par la clé `service_role`, voir historique ci-dessus).
  La sécurité applicative (qui peut voir/modifier quoi) reste entièrement
  gérée dans le code Next.js, centralisée dans `src/lib/access.ts` (voir
  section 6.1).
- **Pas d'API REST/GraphQL générale sur les données** : la lecture passe
  par des Server Components (au chargement de page), l'écriture par des
  Server Actions (`"use server"`, déclenchées par des formulaires ou des
  boutons). Les rares Route Handlers `/api/*` couvrent des besoins précis
  qui ne rentrent pas dans ce modèle : `/api/version` (repère de version,
  6.8), `/api/push/subscribe` (abonnement push, appelé aussi par le
  service worker, 6.15), `/api/cron/reminders` (Vercel Cron, 6.15),
  `/api/tasks/[id]/calendar` (fichier `.ics`, 6.13). Chacun applique son
  propre contrôle d'accès (session et/ou `CRON_SECRET`, plus `canView`
  pour le `.ics`) — voir le tableau des routes en section 7.

## 4. Authentification

Entièrement maison, décrite dans `src/lib/auth.ts` et `src/middleware.ts` :

- **Table `users`** : un prénom (unique, sert d'identifiant), un hash de
  mot de passe, un rôle (`admin`/`user`), une couleur d'avatar, et un
  indicateur `password_set`.
- **Hash de mot de passe** : `scrypt` (module `crypto` natif de Node.js,
  aucune dépendance externe type bcrypt), format stocké
  `sel_hex:cle_derivee_hex`, comparaison en temps constant
  (`timingSafeEqual`).
- **Session** : cookie HTTP-only `session` contenant un JWT signé
  (bibliothèque `jose`, choisie pour tourner sur le runtime Edge du
  middleware sans dépendance Node). Durée de vie : 180 jours. Le secret de
  signature (`SESSION_SECRET`) est une variable d'environnement — le
  changer déconnecte tout le monde.
- **Middleware** (`src/middleware.ts`, Edge runtime) : vérifie uniquement
  la signature du JWT (aucun appel réseau à la base) ; redirige vers
  `/login` si absent/invalide — en ajoutant `?next=<chemin demandé>` pour
  y revenir après connexion (`safeNextPath()` dans `src/lib/nav.ts` valide
  que c'est bien un chemin interne) —, et redirige un utilisateur déjà
  connecté qui visite `/login` vers `/`.
- **Parcours de connexion** (`LoginForm.tsx`) : grille des profils
  (prénom + avatar) → mot de passe. Si `password_set = false` (première
  connexion), le même écran demande le mot de passe temporaire puis fait
  saisir immédiatement un mot de passe personnel (`setPasswordAction`).
  `loginAction` / `setPasswordAction` redirigent vers le `next` transmis
  (chemin interne) s'il y en a un, sinon vers `/`.
- **Changer son mot de passe** : depuis l'écran de connexion (lien
  "Changer mon mot de passe", `setPasswordAction`) ou, une fois connecté,
  depuis l'écran "Mon compte" (`/compte`, `changePasswordAction` — voir
  6.14). Les deux vérifient le mot de passe actuel ; la version connectée
  ne rouvre pas de session (le cookie JWT ne dépend pas du hash).
- **Création de compte / mot de passe oublié** : depuis l'application, par
  un compte administrateur — onglet Admin → « Membres » (voir 6.9).
  Créer un membre pose un mot de passe temporaire et `password_set =
  false` ; « Réinitialiser le mot de passe » fait de même pour un membre
  existant. Le seul compte à créer hors application est le tout premier
  administrateur, semé par `db/neon_schema.sql`
  (« Admin » / « bonjour2026 »).

Ce module gère uniquement *qui est connecté* ; il ne dit rien de *ce que
cette personne a le droit de voir ou modifier une fois connectée* — c'est
le rôle de `src/lib/access.ts`, voir section 6.1.

## 5. Modèle de données

### 5.1 Où trouver le schéma de référence

Depuis la migration Neon (11/09/2026 — voir encadré en section 2), deux
sources complémentaires, toutes deux dans `db/` :

1. **`db/neon_schema.sql`** — la structure **complète et à jour**,
   exécutable telle quelle (voir 5.3). C'est la référence à consulter
   pour connaître l'état actuel des tables (colonnes, valeurs par défaut,
   contraintes `check`, clés étrangères et leurs clauses `on delete`).
   C'est un **script de reset** (`drop table ... cascade` puis
   `create table`) : il ne doit jamais être rejoué sur la base en
   fonctionnement normal, il la détruirait — voir 5.3.
2. **`db/migrations/`** — les évolutions de schéma **postérieures** à
   `neon_schema.sql`, en scripts additifs numérotés (aucun `drop`,
   uniquement `add column if not exists` / `create table if not
   exists`), à exécuter à la main (SQL Editor Neon ou `psql
   "$DATABASE_URL" -f ...`) :
   - `001_user_activity_log.sql` — table `user_activity_log` (streak
     personnel, voir `src/lib/streaks.ts`).

   Toute nouvelle évolution du schéma passe par un nouveau fichier
   numéroté ici (voir section 10), et `neon_schema.sql` est mis à jour en
   parallèle pour rester le reflet fidèle de la structure.

**Le contenu (les lignes) n'est pas versionné ici** : `neon_schema.sql`
ne sème qu'un compte `Admin` de secours (mot de passe temporaire
`bonjour2026`), les 7 catégories par défaut, la ligne unique
`app_settings` et neuf tags de départ. En production, `Admin` a été
renommé `Nicolas`, les autres membres de la famille ont été ajoutés
manuellement en SQL, et la liste des tags/catégories s'est enrichie
depuis l'application.

> **Historique pré-Neon** (jusqu'au 11/09/2026) : la référence
> structurelle était `supabase/recreate_full_schema.sql` (même rôle, sur
> Supabase), avec un historique d'évolutions additives dans
> `supabase/migrations/` (`001_categories_and_tags.sql` à
> `009_categories.sql`). `db/neon_schema.sql` en est la version adaptée
> Neon (12 tables, contenu identique — voir 5.3 pour le détail des
> écarts). Ces fichiers `supabase/` restent dans le dépôt pour référence
> et filet de secours (rollback) jusqu'au nettoyage de Phase 6
> (~25/09/2026), mais ne sont plus la source de vérité : ne plus les
> faire évoluer.

### 5.2 Schéma des tables

**`users`** — un compte par membre de la famille.

| Colonne | Type | Note |
|---|---|---|
| `id` | uuid, PK | |
| `name` | text, unique | Prénom, sert d'identifiant de connexion |
| `password_hash` | text | Format `sel:clé` (scrypt) |
| `role` | text | `admin` \| `user` |
| `color` | text | Couleur hex de l'avatar (une par utilisateur) |
| `password_set` | boolean | `false` = mot de passe temporaire pas encore remplacé |
| `last_login_at` | timestamptz, nullable | Dernière activité (dernier rendu de page authentifié, rafraîchi ≤ 1×/15 min) — voir 6.9 |
| `created_at` | timestamptz | |

**`tasks`** — une tâche.

| Colonne | Type | Note |
|---|---|---|
| `id` | uuid, PK | |
| `title` | text | |
| `description` | text | |
| `due_at` | timestamptz, nullable | Échéance (optionnelle) |
| `recurrence` | jsonb | `{ type, interval?, unit? }` — voir 6.3 |
| `status` | text | `todo` \| `in_progress` \| `done` \| `archived` |
| `visibility` | text | `shared` \| `private` — **champ dérivé, jamais saisi par l'utilisateur** (voir 6.1) |
| `category` | text → `categories.slug` | clé étrangère `on delete restrict`, défaut `autre` — voir 6.2 |
| `created_by` | uuid → `users.id` | |
| `created_at` | timestamptz | |

**`task_assignees`** — table de liaison many-to-many `tasks` ↔ `users`
(une tâche peut être partagée avec plusieurs personnes), avec une colonne
supplémentaire :

| Colonne | Type | Note |
|---|---|---|
| `task_id` | uuid → `tasks.id` | |
| `user_id` | uuid → `users.id` | |
| `role` | text | `editor` \| `viewer`, défaut `editor` — voir 6.1 |

Le créateur d'une tâche figure toujours dans cette table avec `role =
'editor'` sur ses propres tâches (forcé côté application, voir 6.1).

**`comments`** — fil de discussion par tâche (`id`, `task_id`,
`author_id`, `body`, `created_at`) — voir 6.5.

**`categories`** — catégories de tâches, gérables depuis l'admin (`slug`
PK, `label`, `icon`, `position`, `created_at`) — voir 6.2 et 6.9. `icon`
est une clé de `CATEGORY_ICON_CHOICES` (`src/lib/categories.ts`), pas
contrainte en base. Amorcée par `db/neon_schema.sql` (migration
`009_categories.sql` côté historique Supabase) avec 7 catégories de
départ (`achats`, `autre`, `cadeaux`, `enfants`, `famille`, `maison`,
`vacances`) — `autre` est la catégorie de repli, jamais supprimable.

**`app_settings`** — réglages d'instance, une seule ligne (`id = 1`,
contrainte `check`) : `reminder_enabled`, `updated_at`. Onglet
« Réglages » de l'admin (voir 6.9).

**`tags`** — libellés libres (`id`, `name` unique, `created_at`), créés à
la volée depuis le formulaire de tâche, normalisés en minuscules/sans
espaces superflus pour éviter les doublons.

**`task_tags`** — table de liaison many-to-many `tasks` ↔ `tags`.

**`checklist_items`** — sous-tâches à cocher d'une tâche (`id`, `task_id`,
`label`, `done`, `created_at`) — voir 6.10. Pas de colonne d'ordre dédiée :
l'affichage suit `created_at`.

**`activity_log`** — journal d'activité des tâches partagées (`id`,
`task_id`, `actor_id`, `type`, `task_title`, `detail`, `created_at`) —
voir 6.12 et migration `005_activity_log.sql`. `task_id` est en
`on delete cascade` (les lignes d'activité d'une tâche disparaissent avec
elle) ; `actor_id` est en `on delete set null` (une ligne survit à la
suppression du compte de son auteur, mais devient alors invisible dans le
fil — voir 6.12). `task_title` est dénormalisé (recopié au moment de
l'action) plutôt que résolu par jointure à la lecture.

**`notifications`** — notifications « À ton attention » par utilisateur
(`id`, `user_id`, `type`, `task_id` nullable, `title`, `body`, `read_at`,
`created_at`) — voir 6.15 et migration `006_notifications.sql`. `user_id`
et `task_id` sont en `on delete cascade`. `title` est une phrase prête à
afficher (dénormalisée, comme `activity_log.task_title`).

**`push_subscriptions`** — abonnements aux notifications push web, un par
appareil où la personne a activé les notifications (`id`, `user_id`,
`endpoint` unique, `p256dh`, `auth`, `user_agent`, `created_at`) — voir
6.15 et migration `007_push_subscriptions.sql`. `endpoint` et les clés
`p256dh`/`auth` sont fournis par le navigateur au moment de l'abonnement
(`pushManager.subscribe()`) ; purgée automatiquement par `sendPushToUser()`
si l'endpoint répond 404/410 (abonnement révoqué).

**`user_activity_log`** — streak personnel (`id`, `user_id`,
`created_at`), table volontairement minimale : pas de référence de
tâche, pas de contenu, juste « cette personne a fait quelque chose de
qualifiant ce jour-là ». Alimentée pour **toute** tâche, privée ou
partagée, contrairement à `activity_log` ci-dessus (jamais pour une
tâche privée) — voir `src/lib/streaks.ts` et migration
`db/migrations/001_user_activity_log.sql`.

12 tables au total. Aucune notion de Row Level Security côté Neon (voir
section 3) : la sécurité applicative est entièrement gérée par
`src/lib/access.ts`.

### 5.3 Script de reconstruction intégrale (`db/neon_schema.sql`, migration Neon du 11/09/2026)

Ce script est **complet et exécutable tel quel** : il recrée les 12 tables
actuelles (`users`, `tasks`, `task_assignees`, `comments`, `categories`,
`app_settings`, `tags`, `task_tags`, `checklist_items`, `activity_log`,
`user_activity_log`, `notifications`, `push_subscriptions`), les index de
`activity_log`, `user_activity_log`, `notifications` et
`push_subscriptions`, et sème un compte administrateur de secours
(`Admin`, mot de passe temporaire `bonjour2026`), la ligne unique
`app_settings`, les 7 catégories de départ et les 9 tags de départ.
**À n'utiliser qu'en cas de sinistre** (base perdue/corrompue, nouvel
environnement de secours) : c'est un reset complet (`drop table ...
cascade`) qui ne doit jamais être rejoué sur la base en fonctionnement
normal, et il **ne restaure aucune donnée** (comptes de la famille,
tâches, commentaires) — seulement la structure, vide et amorcée. Une
vraie restauration de données perdues passe par les sauvegardes Neon
(Dashboard → Backups/branches) ou un export `pg_dump` antérieur, pas par
ce script.

C'est l'adaptation Neon de l'ancien `supabase/recreate_full_schema.sql`
(voir 5.1) : même 10 tables historiques, mêmes contraintes `check`, mêmes
clés PK/FK et leurs `on delete` (`on delete cascade` pour
`task_assignees`/`comments`/`task_tags`/`checklist_items` et
`activity_log.task_id`, `on delete set null` pour
`activity_log.actor_id` — comportement documenté en 5.2 et 6.12),
augmentée des tables ajoutées depuis (`categories`, `app_settings`,
`user_activity_log`). Deux écarts par rapport à un Postgres géré par un
fournisseur comme Supabase, documentés en tête du script :

1. **Extension `pgcrypto` déclarée explicitement** (`create extension if
   not exists pgcrypto`) pour `gen_random_uuid()` — native en PG13+ donc
   déjà disponible sur Neon (PG16), déclarée par sécurité/portabilité
   plutôt que supposée présente.
2. **Aucune ligne `enable row level security`** : l'application se
   connecte à Neon en propriétaire de la base (`DATABASE_URL`), exempté
   de RLS par construction — il n'y a rien à protéger par policy (voir
   section 3). C'est la différence structurelle avec Supabase, où RLS
   était activé sur toutes les tables mais sans aucune policy
   (contourné par la clé `service_role`).

## 6. Fonctionnalités

### 6.1 Confidentialité, partage et cycle de vie d'une tâche

**Une tâche est privée par défaut** : à sa création, seul son créateur
peut la voir. Elle devient visible par d'autres personnes uniquement si le
créateur les sélectionne explicitement dans le formulaire ("Partager
avec"), avec un rôle par personne :

- **Assigné(e) (`editor`)** : peut voir la tâche, la modifier, changer son
  statut, et commenter.
- **Lecture seule (`viewer`)** : peut voir la tâche et commenter, mais ne
  peut ni la modifier ni changer son statut (le lien "modifier" et les
  boutons de statut n'apparaissent pas pour cette personne sur l'écran de
  détail, et l'URL `/tasks/[id]/edit` renvoie une page introuvable si elle
  y accède directement).

**Vignettes séparées par rôle (`TaskCard.tsx`, liste `/tasks`, 04/09/2026)** :
les avatars des personnes partageant la tâche sont affichés en deux
groupes distincts — assigné(e)s (`editor`, y compris le créateur) à
gauche, lecture seule (`viewer`, estompées à 60% d'opacité) **calées tout
à droite de la carte** (`justify-between`, pas un simple espacement après
le premier groupe) — pour distinguer d'un coup d'œil qui peut agir sur la
tâche de qui peut seulement la consulter. L'écran de détail
(`/tasks/[id]`) fait déjà cette séparation, avec deux lignes libellées
("Assigné(e)s" / "Lecture seule").

**Pastilles qui ne se cassent plus sur mobile (`Badge.tsx`, 04/09/2026)** :
`StatusBadge`/`VisibilityBadge`/`OverdueBadge` sont désormais `shrink-0`
+ `whitespace-nowrap`. Signalé sur `TaskCard.tsx` : sur un titre long, la
ligne titre + pastille de statut (`flex` sans retour à la ligne) réduisait
la pastille elle-même faute de place, cassant son texte en deux lignes
("À" / "faire") plutôt que de laisser le **titre** s'enrouler — le titre a
en complément `min-w-0` pour cette raison. Vérifié en isolant les deux
rendus (avant/après) à 375px de large.

Le créateur d'une tâche a toujours les deux droits (voir/modifier), qu'il
figure ou non explicitement dans la liste de partage. **Le champ
`tasks.visibility` (`shared`/`private`) n'est plus saisi manuellement** :
il est recalculé automatiquement (`computeVisibility` dans
`src/lib/access.ts`) à chaque création ou modification, à partir de la
liste de partage effective — `shared` s'il y a au moins une personne
autre que le créateur, `private` sinon. Il n'existe donc plus de toggle
"Visibilité" dans le formulaire (voir 6.7 pour l'ancien comportement,
retiré).

**Contrôle d'accès centralisé dans `src/lib/access.ts`** :

- `canView(task, userId)` / `canEdit(task, userId)` — vérifications
  synchrones à partir d'une tâche déjà chargée (avec ses `assignees`).
- `getTaskAccess(taskId, userId)` — version asynchrone qui requête
  directement la base, utilisée dans les Server Actions qui n'ont pas
  déjà la tâche en mémoire (modification, suppression, changement de
  statut, commentaire, checklist). Renvoie aussi `title` et `visibility`
  de la tâche (ajouté avec le journal d'activité — voir 6.12) : évite une
  requête séparée aux appelants qui ont besoin de ces deux champs pour
  journaliser une activité. **Vit dans `src/lib/actions.ts`** (fonction
  module-locale, non exportée), pas dans `access.ts` : un bug rencontré
  pendant la migration Neon (Phase 4) a montré que tout fichier
  `src/lib/*.ts` importé par un composant **client** ne doit jamais
  importer `sql` de `src/lib/db.ts` au niveau module, même si la fonction
  qui l'utilise n'est pas celle appelée côté client — le bundler embarque
  alors le client Neon côté navigateur, où `DATABASE_URL` est absent,
  crash silencieux (visible seulement côté navigateur, pas dans les logs
  serveur). `access.ts` n'exporte donc que les fonctions synchrones
  (`canView`/`canEdit`/`computeVisibility`), importable sans risque par
  des composants client.

Ce module est appliqué systématiquement :

- **En lecture** : `getTasks(userId)` et `getTask(id, userId)`
  (`src/lib/queries.ts`) ne renvoient que ce que `canView`
  autorise pour l'utilisateur connecté — le filtrage se fait à la
  **requête**, pas seulement à l'affichage.
- **En écriture** : `updateTaskAction`, `deleteTaskAction` et
  `setStatusAction` (`src/lib/actions.ts`) vérifient `canEdit` en tout
  début d'exécution et lèvent une erreur sinon ; `addCommentAction` ne
  vérifie que `canView` (un lecteur en lecture seule peut commenter, par
  choix explicite) ; la page `/tasks/[id]/edit` fait un `notFound()` si
  l'utilisateur courant n'a pas `canEdit` sur la tâche, plutôt que
  d'afficher un formulaire désactivé.

Statuts de tâche (inchangés) : `todo` (à faire) → `in_progress` (en cours)
→ `done` (terminée) → `archived` (archivée). Les boutons de statut
(`StatusButtons.tsx`) sont tous visibles sur l'écran de détail pour qui a
`canEdit` (il n'y a pas de machine à états stricte) ; ils sont masqués
pour un lecteur en lecture seule.

**Ce module ne couvre pas la modération des commentaires** (voir 6.5),
qui suit une règle légèrement différente (auteur du commentaire ou
créateur de la tâche, pas `canEdit`).

### 6.2 Catégorie

Chaque tâche a une catégorie principale à choix unique, référence
(`tasks.category`, clé étrangère `on delete restrict`) vers la table
`categories` (`slug`, `label`, `icon`, `position` — migration
`009_categories.sql`). Gérables depuis l'onglet « Catégories » de
l'admin (voir 6.9) : créer, renommer, changer d'icône, réordonner,
supprimer (les tâches concernées repassent sur `autre`, catégorie de
repli jamais supprimable — `FALLBACK_CATEGORY_SLUG` dans
`src/lib/categories.ts`). Si la table n'existe pas encore (migration pas
jouée), l'app retombe sur `DEFAULT_CATEGORIES` (même fichier) pour rester
fonctionnelle.

**Icônes** : jeu fermé de 16 choix (`CATEGORY_ICON_CHOICES` dans
`src/lib/categories.ts`) — jeu SVG maison (`src/components/Icons.tsx`),
chacune avec une **couleur associée** (`color`, classe Tailwind `text-*`)
et un **fond pastel assorti** (`bg`, classe `bg-*-100`) de même teinte.
`categoryIconColor()`/`categoryBgColor()` exposent ces classes ; repli
`text-ink-muted`/`bg-sand` pour une icône inconnue. Sur la carte de tâche
(`TaskCard.tsx`), l'étiquette de catégorie prend tout le fond pastel de
son icône et l'icône elle-même repasse en `text-ink` (noir) plutôt que sa
couleur habituelle, pour rester lisible sur ce fond — ailleurs (sélecteur
d'icône admin, écran de détail, pilules du formulaire de tâche), c'est
l'icône qui porte la couleur sur fond neutre. Choix disponibles :
fourre-tout, maison, achats, cadeau, bébé, famille, personne, soleil,
calendrier, checklist, bulle de chat, répétition, étiquette, **jardin**
(`leaf`), santé (`heart`), bricolage (`wrench`).

### 6.3 Échéance et récurrence

**Échéance** (`tasks.due_at`, `timestamptz` nullable) : optionnelle. Le
formulaire de tâche (`TaskForm.tsx`) affiche un `<input datetime-local>`
contrôlé, avec un lien **« Retirer l'échéance »** qui le vide — la saisie
vide est traduite en `due_at = null` par les Server Actions
(`dueAtRaw ? … : null`). Saisie et affichage sont en heure de Paris (voir
8.1). Trois **raccourcis** sous le champ (« Ce soir » 18 h, « Demain
matin » 8 h, « Ce week-end » samedi 10 h — `dueDatePreset()` dans
`src/lib/format.ts`) posent une heure raisonnable plutôt que le 00:00 que
le sélecteur natif retient souvent, ce qui rendrait une tâche « pour
aujourd'hui » aussitôt en retard (audit UX du 10/09/2026, voir 6.16).

**Récurrence** stockée en JSON dans `tasks.recurrence` : `{ type: "none" | "daily" |
"weekly" | "monthly" | "yearly" | "custom", interval?, unit?: "days"|"weeks"|"months" }`.
Quand une tâche récurrente passe à `done`
(`setStatusAction` dans `src/lib/actions.ts`, après vérification
`canEdit` — voir 6.1), la prochaine occurrence est calculée
(`computeNextOccurrence` dans `src/lib/format.ts`) à partir de l'échéance
actuelle, puis une nouvelle tâche `todo` est créée avec le même titre, la
même description, la même catégorie, les mêmes tags, la même checklist
(décochée — voir 6.10) et **les mêmes partages (personne + rôle)**, pour
que la confidentialité d'une tâche récurrente reste cohérente d'une
occurrence à l'autre. Si la tâche récurrente n'a pas d'échéance, aucune
occurrence n'est régénérée (rien à incrémenter) — le formulaire affiche
alors un avertissement dès qu'un type de récurrence est choisi sans
échéance (audit UX du 10/09/2026, voir 6.16). Les commentaires, eux,
ne sont jamais recopiés sur une nouvelle occurrence — ils sont propres à
chaque instance de la tâche. **Cette régénération automatique n'est pas
journalisée dans le fil d'activité** (voir 6.12) — seul le changement de
statut qui la déclenche l'est.

### 6.4 Tags

Système de tags libres many-to-many (`tags` + `task_tags`). Dans le
formulaire de tâche, l'utilisateur coche des tags existants ou tape un
nouveau nom : `upsertTagIds` (`src/lib/queries.ts`) crée les tags
manquants (normalisés en minuscules/trim) et renvoie leurs identifiants ;
`syncTaskTags` (`src/lib/actions.ts`) remplace ensuite l'ensemble des
tags de la tâche par la sélection courante (delete + insert). Neuf tags
sont pré-remplis à l'installation (voir 5.1) ; la liste s'enrichit
librement ensuite.

### 6.5 Commentaires

Fil de discussion simple par tâche (`comments`), sans édition une fois
posté. Le champ d'ajout est en **tête** du fil et les commentaires sont
affichés **du plus récent au plus haut** (tri `created_at` descendant
dans `getComments`, `src/lib/queries.ts`) : le dernier commentaire posté
apparaît juste sous le champ de saisie, sans avoir à faire défiler.
Ajouter un commentaire est accessible à quiconque a `canView` sur la
tâche (créateur, assigné(e), ou personne en lecture seule) — voir 6.1.
Le champ de saisie (`CommentForm.tsx`) est un `<textarea>` à hauteur
automatique (une ligne au départ, grandit jusqu'à ~6 puis défile) ;
**Ctrl/Cmd+Entrée** envoie, **Entrée** insère un retour à la ligne
(audit UX UX-13). L'ajout est confirmé par un toast « Commentaire
ajouté ».

La **carte de tâche** (`TaskCard.tsx`, liste `/tasks`) affiche une icône
bulle + le nombre de commentaires quand il est > 0. Le compte vient de
l'agrégat PostgREST `comments(count)` ajouté à `TASK_SELECT`
(`src/lib/queries.ts`, exposé en `Task.commentCount`) — pas de requête
supplémentaire.

La suppression est **annulable** (voir 6.16, `useUndoableDelete`) : le
commentaire disparaît tout de suite, un toast « Commentaire supprimé ·
Annuler » laisse quelques secondes, et l'appel serveur n'est envoyé qu'à
l'expiration du délai.

**Suppression d'un commentaire (02/09/2026)** : un commentaire peut être
supprimé par **son propre auteur**, ou par **le créateur de la tâche**
(qui reste responsable de sa tâche et peut ainsi modérer les commentaires
qui y sont laissés). Un éditeur ou un lecteur simplement assigné ne peut
supprimer que ses propres commentaires, pas ceux d'un autre — cette règle
est **distincte** de `canEdit` (section 6.1), qui donnerait ce droit à
n'importe quel éditeur assigné : `deleteCommentAction`
(`src/lib/actions.ts`) compare directement `comment.author_id` et
`getTaskAccess(...).createdBy` à l'utilisateur courant plutôt que de
s'appuyer sur `canEdit`.

`CommentThread.tsx` est un composant client (contrairement aux sections
purement serveur) : il reçoit `currentUserId` et `canModerate` (calculé
côté page comme `task.created_by === profile.id`) et n'affiche l'icône de
suppression que sur les commentaires que l'utilisateur courant a le droit
de supprimer. La suppression passe par `useGlobalTransition()` +
`router.refresh()`, comme les autres mutations depuis l'introduction du
gel d'écran global (voir 6.11), sans demande de confirmation — même choix
que pour les items de checklist, une action jugée à faible risque
contrairement à la suppression d'une tâche entière.

### 6.6 Écran d'accueil (`/`)

Message de bienvenue (« Bonjour / Bonsoir, {Prénom} » selon l'heure de
Paris — voir 6.16 — + date du jour), trois tuiles cliquables
(`HomeDashboard.tsx`), puis, dans l'ordre : la bannière d'invite aux
notifications (`NotificationsNudge`, voir 6.16, conditionnelle), le fil
**« À ton attention »** (`AttentionFeed.tsx` — voir 6.15, affiché
seulement s'il y a au moins une notification non lue), le fil
**« Partagées avec toi »** (`SharedWithYouFeed.tsx` — voir 6.16, tâches en
lecture seule, affiché seulement s'il y en a) et enfin le fil « Activité
du jour » (`ActivityFeed.tsx` — voir 6.12, toujours affiché, avec un état
vide sinon). « À ton attention » et « Activité du jour » sont
**volontairement disjoints** — voir INC-7 dans 6.12 et 6.16. Les
compteurs sont calculés **côté
client** (voir 8.1 sur la raison de ce choix) à partir de la liste de
tâches déjà filtrée par `getTasks` (donc uniquement les tâches visibles
par l'utilisateur connecté — voir 6.1), puis restreinte aux tâches dont il
est **responsable** : créées par lui, ou partagées avec lui avec droit de
modification (« Assigné(e) ») — jamais celles en lecture seule (« Lecture
seule »), même définition que `canEdit()` (`src/lib/access.ts`). Correctif
du 04/09/2026, en deux temps : d'abord restreint les compteurs à
`canEdit()` (ils comptaient aussi les tâches en lecture seule), puis
aligné la portée par défaut "mes tâches" de la liste (`TaskFilterList.tsx`,
voir 6.7) sur cette même définition — les deux affichent donc désormais
toujours le même chiffre, cliquer sur une tuile atterrit sur exactement ce
qu'elle comptait.

- **En retard** (ajoutée le 03/09/2026) : nombre de tâches dont
  l'échéance est dépassée, ni terminées ni archivées — même définition
  que le badge "En retard" déjà utilisé sur la carte de tâche et l'écran
  de détail (`isOverdue()` dans `src/lib/format.ts`). Mise en avant en
  rouge (mêmes teintes que ce badge) dès que son compte est supérieur à
  0. Tuile en pleine largeur, au-dessus des deux suivantes.
- **Aujourd'hui** : nombre de tâches ouvertes (`todo`/`in_progress`) dont
  l'échéance tombe le jour même.
- **Cette semaine** : nombre de tâches ouvertes dont l'échéance tombe
  entre aujourd'hui et le dimanche à venir inclus (semaine restante, pas
  lundi-dimanche).

Les tuiles "Aujourd'hui" et "Cette semaine" utilisent une disposition
compacte : icône à gauche, compteur et libellé empilés à sa droite au même
niveau vertical, plutôt qu'un empilement en trois lignes — hauteur réduite
à la demande de l'utilisateur (03/09/2026). Le libellé de la tuile "Cette
semaine" est simplement "Dues cette semaine" (le suffixe "(dim.)"
initialement affiché a été retiré, sur demande de l'utilisateur, la portée
"jusqu'au dimanche à venir inclus" restant décrite plus haut sans avoir
besoin de figurer dans le libellé lui-même).

**Aucun des trois compteurs ne compte une tâche terminée (`done`) ou
archivée (`archived`)** — "Aujourd'hui"/"Cette semaine" ne portent que sur
les tâches `todo`/`in_progress` (`open` dans `HomeDashboard.tsx`), "En
retard" exclut `done`/`archived` par construction de `isOverdue()`.

Les tuiles "Aujourd'hui" et "Cette semaine" sont des liens vers
`/tasks?dueFrom=YYYY-MM-DD&dueAtMost=YYYY-MM-DD` (voir 6.7) : depuis le
10/09/2026 elles passent **les deux bornes** de l'intervalle, de sorte
que la liste obtenue au clic affiche exactement ce que la tuile a compté.
Auparavant seule `?dueAtMost=` était passée et la liste laissait aussi
entrer les tâches déjà en retard (audit UX INC-1, voir 6.16). La tuile
"En retard" est un lien vers `/tasks?overdue=1`, qui active le filtre
"En retard uniquement" de `TaskFilterList.tsx` (voir 6.7).

### 6.7 Liste des tâches, recherche et filtres (`/tasks`)

**Filtrage entièrement côté client, sans onglet ni paramètre `?filter=`
côté serveur.** `src/app/tasks/page.tsx` se contente de charger
`getTasks(profile.id)` (déjà filtré par `canView` — voir 6.1) et
de le passer tel quel à `TaskFilterList.tsx`, qui applique tous les
critères en mémoire (`useMemo`) par-dessus cette liste — la liste de
tâches d'une famille reste petite, ce qui évite un aller-retour serveur à
chaque frappe/clic. **L'ancien composant à deux onglets `FilterTabs.tsx`
("Toutes"/"Mes tâches") a été retiré le 03/09/2026** dans le cadre d'une
rationalisation demandée par l'utilisateur pour rendre l'écran plus
lisible ; ce qu'il couvrait (portée) est repris ci-dessous comme premier
filtre, au même titre que les autres.

Sous la barre de recherche (sous-chaîne insensible à la casse sur titre +
description, toujours visible), les filtres eux-mêmes sont regroupés dans
un **volet dépliable "Filtres"**, replié par défaut (état `filtersOpen`
dans `TaskFilterList.tsx`, ajouté le 04/09/2026 à la demande de
l'utilisateur pour ne pas surcharger l'écran par défaut) : un bouton
affichant "Filtres" et un chevron (`IconChevronDown`, pivote de 180° une
fois le volet ouvert) déplie/replie les 4 lignes de filtres décrites
ci-dessous. Un petit point orange apparaît à côté du mot "Filtres" quand
au moins un filtre s'écarte de sa valeur par défaut (même condition que
`hasActiveFilters`, voir plus bas) — repère visible même volet replié,
pour ne pas oublier qu'un filtre est actif.

**Volet replié : résumé texte des critères** (`filterSummary`,
04/09/2026) — une seconde ligne sous "Filtres", en petit et estompée,
tronquée si trop longue, qui liste les critères en cours sans avoir à
déplier : les **statuts cochés** toujours (« À faire, En cours » par
défaut, ou « Tous les statuts » si les 4 sont cochés, « Aucun statut »
si aucun) ; puis, seulement s'ils s'écartent du défaut, « Y compris
lecture seule » (bouton de portée décoché), « Partagées »/« Privées », la
catégorie, « Échéance ≤ JJ/MM/AAAA », « En retard uniquement », les
`#tags`, et « « recherche » » si le champ de recherche est rempli. Masqué
quand le volet est déplié (les contrôles sont alors tous visibles).

Une fois déplié, chaque ligne peut regrouper deux filtres séparés par une
**barre verticale** sur desktop (`FilterSeparator`, ajoutée le 03/09/2026 ;
**masquée en dessous du point de rupture Tailwind `sm`**, ajout du
04/09/2026 à la demande explicite de l'utilisateur — sur mobile, chaque
groupe de filtres d'une ligne passe à la ligne suivante, l'un sous
l'autre, plutôt que de rester côte à côte séparé par une barre qui
n'aurait plus de sens dans cette disposition empilée) :

1. **Portée │ statut** :
   - **Portée** : un seul bouton, **« Uniquement mes tâches », coché par
     défaut** (`scope = "mine"`) — ne garde que `canEdit(task,
     currentUserId)` (`src/lib/access.ts`, prop `currentUserId` transmise
     par `tasks/page.tsx`) : créateur, ou assigné(e) avec droit de
     modification. **Le décocher** (`scope = "all"`) ajoute les tâches où
     l'utilisateur est seulement en **lecture seule** (`canView`). Le
     libellé « Toutes les tâches » (bouton décoché par défaut, à activer)
     s'était révélé trouble à l'usage — inversé le 04/09/2026 en un bouton
     positif coché par défaut. **Même définition que les compteurs de
     l'accueil** (`canEdit()`, voir 6.6) — remplace l'ancienne portée
     (`task.created_by === currentUserId` seul, qui excluait à tort les
     tâches assignées créées par quelqu'un d'autre) : un compteur de
     l'accueil et la liste qu'on obtient en cliquant dessus affichent
     toujours le même total, sans forcer de portée particulière en
     arrivant depuis une tuile (`cameFromTile` dans `TaskFilterList.tsx`
     continue seulement à ignorer tout filtre mémorisé dans ce cas — voir
     plus bas).
   - **Statut** : quatre boutons à cocher indépendamment (À faire, En
     cours, Terminée, Archivée — `STATUS_ORDER`/`STATUS_LABELS` dans
     `src/lib/format.ts`), sélection multiple comme les tags. **À faire**
     et **En cours** sont cochés par défaut. Un bref essai avec un seul
     bouton à bascule "tous les statuts / actifs" (livré puis remplacé le
     même jour) s'est révélé peu pratique à l'usage — l'utilisateur a
     demandé à revenir à quatre boutons indépendants, plus précis
     (permet par exemple de ne voir que les tâches "Terminées", ce que le
     bouton à bascule ne permettait pas).
2. **Catégorie │ échéance** :
   - **Catégorie** : liste déroulante à sélection unique (`<select>`),
     remplace l'ancienne sélection par puces qui autorisait plusieurs
     catégories à la fois. "Autre" est volontairement placée en dernière
     position de la liste plutôt qu'à sa place alphabétique
     (`CATEGORY_SELECT_ORDER` dans `TaskFilterList.tsx`) — demande
     explicite de l'utilisateur, "Autre" étant la catégorie fourre-tout,
     pas une catégorie comme les autres.
   - **Échéance** : un **intervalle** « du … au … » — deux `<input
     type="date">` (`dueFrom` et `dueAtMost`), avec un bouton « Effacer »
     qui vide les deux. Ne garde que les tâches ayant une échéance
     renseignée comprise dans l'intervalle (bornes incluses ; une seule
     borne suffit). Pré-remplissable via `?dueFrom=` et/ou `?dueAtMost=` :
     les tuiles « Aujourd'hui » et « Cette semaine » de l'accueil passent
     **les deux bornes** pour cadrer un intervalle exact, afin que la
     liste affiche précisément ce que la tuile a compté (auparavant seule
     `?dueAtMost=` était passée, ce qui laissait aussi entrer les tâches
     en retard — corrigé le 10/09/2026, voir 6.16).
3. **Partagé/Privé │ en retard │ lecture seule** :
   - Partagé/Privé : **contrôle segmenté** (Toutes / Partagées / Privées,
     segments accolés dans un seul cadre plutôt que trois pilules
     séparées, pour signaler qu'ils s'excluent), filtre sur le champ
     dérivé `visibility` (voir 6.1).
   - En retard uniquement : bouton à bascule, même définition que la
     tuile "En retard" de l'accueil (`isOverdue()`) — voir 6.6. Pré-activé
     via `?overdue=1`, utilisé par cette tuile.
   - **Lecture seule uniquement** : bouton à bascule (audit UX UX-12) —
     ne garde que les tâches où l'utilisateur n'a **pas** le droit de
     modifier. **Prime sur la portée** quand il est actif (le prédicat
     ignore alors le bouton « Uniquement mes tâches »). Pré-activé via
     `?readOnly=1`, utilisé par le lien « Voir tout » du fil « Partagées
     avec toi » de l'accueil (voir 6.16).
4. **Tags** — sélection multiple, logique OR (une tâche matche si elle a
   au moins un des tags cochés). Pas de séparateur sur cette ligne, qui ne
   porte qu'un seul groupe de filtres.

Les pilules de sélection multiple (statuts, tags) affichent une **coche**
quand elles sont actives, et tous ces boutons portent `aria-pressed` +
`role="group"` — l'affordance ne repose plus uniquement sur la couleur
(audit UX du 10/09/2026, voir 6.16).

Tous les critères actifs se cumulent (ET logique entre les lignes et entre
portée/statut, OU logique entre les statuts cochés et entre les tags
sélectionnés) — un seul `filter()` dans le `useMemo` de
`TaskFilterList.tsx` applique l'ensemble ; une tâche est retenue seulement
si son statut fait partie de l'ensemble coché (`statuses.has(task.status)`
— aucun statut coché signifie donc aucune tâche affichée, comme pour les
tags). `hasActiveFilters` (utilisé pour distinguer "aucun résultat parce
que la famille n'a aucune tâche" de "aucun résultat à cause des filtres
choisis") tient compte de tous ces critères, y compris l'écart par rapport
aux valeurs par défaut (portée "mes tâches", statuts {à faire, en cours}
— comparaison d'ensembles, pas une simple égalité de valeur).

**Mémorisation du filtre pour la session du navigateur (04/09/2026).**
Sans rien de plus, ouvrir une tâche puis revenir en arrière démonte et
remonte `TaskFilterList` (route différente, `/tasks/[id]`) : les 8
critères repartiraient de leurs valeurs par défaut à chaque retour sur
`/tasks`, obligeant à refaire son filtrage. `sessionStorage`
(`todolist:tasks-filters`) conserve désormais l'état choisi tant que
l'onglet/l'appli reste ouvert(e) — pas `localStorage`, qui survivrait à
une fermeture, ce qui n'est pas ce qui est demandé.

- **Écriture** : un `useEffect` sérialise l'état courant (portée, statuts,
  catégorie, intervalle d'échéance `dueFrom`/`dueAtMost`, partagé/privé,
  en retard uniquement, tags, texte de recherche) à chaque changement.
- **Lecture** : restaurée par un second `useEffect`, exécuté **une seule
  fois après le premier rendu**, jamais dans les `useState` d'initialisation
  eux-mêmes — `sessionStorage` n'existe pas côté serveur, l'y lire aurait
  créé un désaccord entre le HTML rendu par le serveur (Server Component,
  sans accès à `sessionStorage`) et le premier rendu client, source
  classique d'avertissement d'hydratation React.
- **Ignorée en arrivant depuis une tuile / un lien de l'accueil**
  (`cameFromTile` — voir portée ci-dessus) : les valeurs de l'URL
  (`?overdue=1`, `?dueFrom=`, `?dueAtMost=`, `?readOnly=1`) priment alors
  sur tout ce qui aurait pu être mémorisé, un clic sur une tuile étant une
  intention explicite ("montre-moi exactement ça"). Dans ce cas, un
  **bandeau « Filtré depuis l'accueil · Réinitialiser »** s'affiche
  au-dessus du volet (audit UX INC-9) ; « Réinitialiser » remet tous les
  filtres à leur valeur par défaut.
- Échec silencieux si `sessionStorage` est indisponible (navigation
  privée, quota) : le filtre ne survit simplement pas à la navigation,
  sans rien bloquer.

### 6.8 Rafraîchissement automatique à l'ouverture

Distinct des correctifs de cache (section 8.2, qui garantissent que les
*données* affichées sont toujours à jour) : ce mécanisme garantit que le
*code* de l'appli exécuté dans le navigateur est toujours celui du dernier
déploiement, y compris pour un onglet ou une PWA (ajoutée à l'écran
d'accueil) resté ouvert entre deux déploiements — cas où, sans ça, rien ne
pousse spontanément un onglet déjà chargé à recharger son code JS.

- **`src/app/api/version/route.ts`** : petite route qui renvoie
  l'identifiant du déploiement Vercel courant (`VERCEL_GIT_COMMIT_SHA`,
  fournie automatiquement par Vercel à chaque build), jamais mise en
  cache. Exclue du middleware d'authentification (`src/middleware.ts`)
  pour rester interrogeable même depuis l'écran de connexion.
- **`src/components/AppUpdateWatcher.tsx`** (monté dans `layout.tsx`,
  donc actif sur tout l'appli) : retient la version chargée au démarrage,
  la recompare à chaque retour au premier plan (`visibilitychange`,
  `focus`, `pageshow` — ce dernier couvre aussi la restauration bfcache,
  fréquente en rouvrant une PWA sur mobile sans rechargement réseau), et
  recharge la page automatiquement si une nouvelle version est détectée.
  Un filet de sécurité (`setInterval`, 15 min) couvre le cas où l'appli
  resterait au premier plan sans jamais perdre le focus.
- En complément, `ServiceWorkerRegister.tsx` revérifie aussi le service
  worker lui-même (`registration.update()`) à chaque retour au premier
  plan — utile si `public/sw.js` change à nouveau un jour, indépendamment
  de ce mécanisme de version qui, lui, ne dépend pas d'un changement du
  service worker pour se déclencher.

**Rafraîchissement manuel — tirer pour rafraîchir** (`PullToRefresh.tsx`,
audit UX du 10/09/2026, voir 6.16) : sur mobile, un tirage vers le bas
depuis le haut de l'écran déclenche `router.refresh()` (relecture des
Server Components). Utile pour reprendre la main quand on veut forcer une
mise à jour des *données* sans attendre — le rafraîchissement automatique
ci-dessus ne porte, lui, que sur le *code*.

### 6.9 Administration (`/admin`)

Écran réservé au compte de rôle `admin` (lien "Admin" masqué pour les
autres dans `Topbar.tsx` sur desktop, et remplacé par une entrée
« Espace admin » sur `/compte` en mobile — voir 6.16 ; page elle-même
protégée côté serveur par un `notFound()` sinon, même logique que les
autres pages restreintes de l'appli — voir 6.1). Quatre onglets
(`AdminScreen.tsx`, contrôle segmenté) : **Membres**, **Catégories**,
**Réglages** et **Activité**.

#### Onglet « Membres » — gestion des comptes (10/09/2026)

`src/components/UserManager.tsx` ; les trois opérations sont des Server
Actions de `src/lib/admin-actions.ts`, chacune précédée de
`requireAdmin()` (session valide + `role === "admin"`, sinon `redirect`
ou `throw` — on ne confirme pas la fonctionnalité à un non-admin).

- **Créer un membre** (`createMemberAction`) : prénom (unique — une
  collision renvoie une erreur lisible via le code Postgres `23505`),
  rôle (`Membre` / `Administrateur`), **mot de passe temporaire** (champ
  en clair, bouton « Générer » → `generateTempPassword()` dans
  `src/lib/temp-password.ts`, un mot + 3 chiffres, ex. `myrtille-750`).
  Le compte est créé avec `password_set = false` : à sa première
  connexion, l'application lui fait remplacer ce mot de passe par le
  sien (flux de 6.1 / section 4). Un panneau vert persistant rappelle le
  mot de passe à transmettre. La couleur d'avatar est attribuée
  automatiquement (`pickAvatarColor()`, `src/lib/avatar-colors.ts` — la
  première teinte non déjà prise).
- **Réinitialiser le mot de passe** (`resetMemberPasswordAction`) :
  nouveau mot de passe temporaire + `password_set = false` → la personne
  retombe sur le flux de première connexion. Le cookie de session
  existant reste techniquement valide (le JWT ne dépend pas du hash) —
  sans conséquence pour le cas d'usage principal (mot de passe oublié :
  la personne est de toute façon déconnectée).
- **Supprimer un membre** (`deleteMemberAction`) : `ConfirmDialog` qui
  **détaille ce qui part avec le compte** (tâches créées, dont partagées ;
  commentaires). Garde-fous : on ne peut pas se supprimer soi-même, ni
  supprimer le **dernier administrateur**. La suppression fait le ménage
  explicite (tâches créées → cascade sur assigné(e)s / commentaires /
  tags / checklist / activité / notifications ; commentaires laissés
  ailleurs ; lignes d'activité) puis supprime la ligne `users`. La
  **migration `008_user_management.sql`** met aussi `tasks.created_by` et
  `comments.author_id` en `ON DELETE CASCADE` (schéma propre pour un
  nouveau déploiement) ; le code ne dépend pas d'elle. Un compte supprimé
  ne peut plus se connecter et `getCurrentUser()` le traite comme absent
  à la navigation suivante.

Plus besoin de SQL pour gérer les comptes (voir section 4 et 8.5).

#### Onglet « Catégories » — gestion des catégories de tâches

`src/components/CategoryManager.tsx` ; Server Actions de
`src/lib/category-actions.ts` (`createCategoryAction`,
`updateCategoryAction`, `moveCategoryAction`, `deleteCategoryAction`),
chacune précédée de `requireAdmin()`. Créer (nom → `slug` généré par
`slugifyCategory()`, ASCII, 32 caractères max, collision refusée),
renommer, changer d'icône (`IconPicker`, voir 6.2 pour le jeu de choix et
leurs couleurs), réordonner (haut/bas, `position` échangée entre
voisines), supprimer (`ConfirmDialog` détaillant que les tâches
concernées repassent sur « Autre » — catégorie de repli jamais
supprimable, ni la dernière catégorie restante). Si la table `categories`
n'existe pas encore, chaque action renvoie une erreur explicite plutôt
qu'une erreur Postgres brute (« Applique d'abord la migration 009 »).

**Onglet « Réglages »** (`src/components/SettingsPanel.tsx` /
`src/lib/settings-actions.ts`, non détaillé ici) : rappel automatique et
informations d'instance.

#### Onglet « Activité » — statistiques par membre

`src/components/UserStatsList.tsx` (inchangé). Affiche, pour chaque membre
de la famille : sa dernière activité (`users.last_login_at`, migration
`003_last_login.sql`), et 4 compteurs de tâches créées, ventilés sur deux
axes — total / 7 derniers jours, et privées / partagées (sur le champ
dérivé `tasks.visibility`, voir 6.1) — présentés sous forme d'un petit
tableau à deux colonnes (Privées, Partagées) et deux lignes (Total, 7
derniers jours) par personne.

**Volontairement limité à des compteurs agrégés, jamais au contenu des
tâches** — point vérifié explicitement à la demande de l'utilisateur.
`getUserStats()` (`src/lib/queries.ts`) ne sélectionne que
`created_by, created_at, visibility` sur la table `tasks` (aucun titre,
description, catégorie ou autre) ; l'écran `/admin` n'affiche que le nom
de la personne, ses 4 compteurs et sa dernière activité. Même un compte
admin ne voit donc jamais, sur cet écran, le contenu d'une tâche privée
d'un autre membre — cohérent avec le modèle "privée par défaut" de la
section 6.1, que cet écran ne contourne pas.

**"Dernière activité" plutôt que "dernière connexion".** La session dure
180 jours (`SESSION_DURATION` dans `src/lib/auth.ts`) : un membre peut
utiliser l'appli tous les jours sans jamais repasser par l'écran de
connexion, donc horodater uniquement `loginAction`/`setPasswordAction`
laissait `last_login_at` figé sur la dernière saisie de mot de passe
(souvent des semaines en arrière). `getCurrentUser()` rafraîchit donc
`last_login_at` à **chaque rendu de page authentifié**, via
`touchLastSeen()`, mais au plus **une fois toutes les 15 minutes** par
personne (comparaison avec la valeur courante avant écriture) et sans
jamais bloquer l'affichage si l'écriture échoue. La colonne garde son nom
`last_login_at` (pas de migration) mais représente désormais la dernière
fois où la personne a ouvert une page de l'appli.

`last_login_at` reste `NULL` pour les comptes jamais vus depuis
l'application de la migration 003 — affiché comme "Jamais vu".

### 6.10 Checklist par tâche

Chaque tâche peut porter une checklist (sous-tâches à cocher), gérée
directement depuis l'écran de détail (`ChecklistSection.tsx`) — ajout,
coche, suppression d'un item — plutôt que depuis le formulaire de
création/modification, sur le même principe que les commentaires mais en
plus immédiat (chaque action recharge la page via `router.refresh()`,
pas de redirection).

Contrairement aux commentaires (ouverts aux lecteurs pour l'ajout —
voir 6.5), ajouter/cocher/supprimer un item exige `canEdit` : une
checklist fait partie du contenu de la tâche, pas d'une discussion
autour. Un utilisateur qui n'a que `canView` voit la checklist (barre de
progression + items, cases à cocher désactivées) sans pouvoir la
modifier ; si elle est vide, la section ne s'affiche même pas pour lui.

**Indicateur d'avancement dans la liste** (`TaskCard.tsx`) : dès qu'une
tâche a au moins un item de checklist, une mini barre de progression et
le compte `fait/total` apparaissent sur sa carte, dans `/tasks` comme
dans "Mes tâches". Une tâche sans checklist n'affiche rien de plus —
l'indicateur n'apparaît jamais pour une tâche qui n'en a pas.

**Récurrence** : quand une tâche récurrente est régénérée (voir 6.3), sa
checklist est recopiée sur la nouvelle occurrence avec tous les items
remis à zéro (`done: false`) — reprendre l'état coché de l'occurrence
qui vient de se terminer n'aurait pas de sens pour, par exemple, une
liste de courses hebdomadaire.

### 6.11 Gel d'écran global et indicateur de traitement en cours

Chaque action de mutation (bouton de statut, checklist, commentaire,
formulaire de tâche, connexion/changement de mot de passe, déconnexion)
désactivait déjà individuellement son propre bouton pendant le
traitement (`useTransition` local), mais laissait le reste de l'écran
cliquable — un autre bouton ou un lien de navigation restait actionnable
pendant qu'une action précédente était encore en cours de traitement
côté serveur. Sur demande de l'utilisateur, ce comportement est remplacé
par un **gel de l'écran entier**, actif depuis la validation de l'action
jusqu'au réaffichage effectif de la page qui en résulte.

**`src/components/PendingOverlay.tsx`** centralise ce mécanisme, sous
forme d'un contexte React portant un **compteur** d'actions en cours (pas
un simple booléen, pour rester correct si deux actions se chevauchent —
par exemple un double-clic déclenchant deux Server Actions avant que la
première ne se termine) :

- **`PendingOverlayProvider`** — monté une seule fois dans `layout.tsx`,
  autour de `{children}`, donc actif sur toute l'application. Affiche un
  overlay plein écran (`position: fixed`, `z-[100]`, fond légèrement
  flouté, spinner, texte "Veuillez patienter...") tant que le compteur est
  strictement positif, et bloque le défilement de la page en arrière-plan
  (`document.body.style.overflow = "hidden"`) pendant la même période.
- **`useGlobalTransition()`** — remplacement direct de `useTransition`
  (React) pour tout composant qui déclenche une Server Action
  manuellement, hors d'un `<form action={...}>` natif (le pattern
  `startTransition(async () => { await action(...); router.refresh() })`
  déjà utilisé dans plusieurs composants) : incrémente le compteur global
  au moment de l'appel, le décrémente une fois le callback résolu (bloc
  `finally`, donc même en cas d'erreur). Utilisé dans `StatusButtons.tsx`,
  `ChecklistSection.tsx`, `CommentForm.tsx`, `CommentThread.tsx` (bouton
  de suppression, voir 6.5), `LoginForm.tsx`, et par le bouton "Supprimer
  la tâche" de `TaskForm.tsx`.
- **`<FormPendingBridge />`** — composant sans rendu visuel, à poser comme
  enfant direct d'un `<form action={serverAction}>` natif (pattern non
  couvert par `useGlobalTransition`, qui ne s'applique qu'aux
  déclenchements manuels). S'appuie sur `useFormStatus()` (API de
  `react-dom`, disponible dans React 18.3.1 bien que normalement associée
  à React 19) pour observer l'état `pending` du formulaire parent et
  piloter le même compteur global en conséquence. **Point de
  comportement Next.js exploité ici** : quand la Server Action d'un tel
  formulaire se termine par un `redirect()` côté serveur, `pending` (et
  donc l'état de gel) reste vrai pendant toute la redirection et le rendu
  de la page de destination, pas seulement jusqu'à la réponse réseau
  initiale — ce qui permet à l'overlay de rester affiché jusqu'au
  réaffichage effectif, conformément à la demande de l'utilisateur.
  Posé dans `TaskForm.tsx` (création/modification de tâche) et
  `LogoutButton.tsx` (déconnexion).

**Couverture exhaustive** : tous les composants de `src/components` qui
déclenchent une mutation (recherche de `useTransition|Action\(|action=\{|
formAction`) sont passés par l'un des deux mécanismes ci-dessus —
`StatusButtons.tsx`, `ChecklistSection.tsx`, `CommentForm.tsx`,
`CommentThread.tsx`, `LoginForm.tsx`, `TaskForm.tsx`, `LogoutButton.tsx`.
Tout nouveau composant de mutation doit faire de même plutôt que
d'utiliser `useTransition` (React) directement, sous peine de laisser
l'écran cliquable pendant son propre traitement. (`ActivityFeed.tsx`, lui,
n'a rien à modifier — il n'affiche que des données, sans mutation.)

### 6.12 Journal d'activité et fil "Activité du jour" (03/09/2026)

Sur demande de l'utilisateur : les autres membres de la famille doivent
pouvoir voir, sur l'écran d'accueil, ce qui s'est passé aujourd'hui sur
les tâches qu'ils partagent (nouvelle tâche, modification, changement de
statut, commentaire, item de checklist), sans avoir à ouvrir chaque tâche.

**Écriture — `logActivity()` dans `src/lib/actions.ts`.** Fonction interne
(non exportée), appelée à la fin de chaque Server Action de mutation
concernée, uniquement si la tâche est `shared` (au moins une autre
personne que le créateur y a accès — sur une tâche privée, personne
d'autre ne pourrait de toute façon voir cette activité) :

| Action déclenchante | Type journalisé |
|---|---|
| `createTaskAction` | `task_created` |
| `updateTaskAction` | `task_updated` |
| `setStatusAction` | `status_changed` (detail = libellé du nouveau statut) |
| `addCommentAction` | `comment_added` |
| `deleteCommentAction` | `comment_deleted` |
| `addChecklistItemAction` | `checklist_item_added` (detail = libellé de l'item) |
| `toggleChecklistItemAction` | `checklist_item_checked` / `checklist_item_unchecked` (detail = libellé) |
| `deleteChecklistItemAction` | `checklist_item_removed` (detail = libellé de l'item, lu avant suppression) |

Chaque ligne enregistre `task_id`, `actor_id` (l'utilisateur qui a fait
l'action), `type`, `task_title` (recopié au moment de l'action) et un
`detail` optionnel. **Écriture volontairement non bloquante** : une erreur
d'insertion (par exemple parce que la migration `005_activity_log.sql`
n'a pas encore été appliquée) est journalisée côté serveur
(`console.error`) mais ne fait jamais échouer l'action principale — créer
une tâche, commenter, etc. doivent toujours réussir même si le journal
d'activité, lui, échoue à s'écrire.

`getTaskAccess()` (`src/lib/access.ts`) a été étendu pour renvoyer aussi
`title` et `visibility` de la tâche (en plus de `createdBy`/`canView`/
`canEdit`) : les Server Actions qui n'avaient pas déjà la tâche en mémoire
(commentaires, checklist) en ont besoin pour journaliser sans requête
supplémentaire.

**Lecture — `getRecentActivity()` dans `src/lib/queries.ts`.** Appelée
depuis `src/app/page.tsx` (écran d'accueil) avec la liste des `id` de
tâches déjà renvoyée par `getTasks()` (donc déjà filtrée par `canView` —
voir 6.1) et une fenêtre de 48h ; dégrade en liste vide (avec
`console.error`) si la table n'existe pas encore, même principe de
tolérance qu'à l'écriture.

**Regroupement et affichage — `src/components/ActivityFeed.tsx`**
(composant client, affiché sous les compteurs de l'accueil — voir 6.6).
Deux traitements faits côté client plutôt que dans la requête serveur, sur
le même principe que les compteurs (voir 8.1, note sur le fuseau
horaire) :

- **Filtre "aujourd'hui"** : clé de date locale (`dateKeyFromDate`/
  `dateKeyFromIso`, voir `src/lib/format.ts`), pas une comparaison UTC
  côté serveur.
- **Exclusion de mes propres actions** : `actor_id === currentUserId` est
  filtré — inutile de m'informer de ce que je viens de faire moi-même. Une
  ligne dont l'auteur a été supprimé depuis (`actor` `null`, `actor_id`
  passé à `null` par la contrainte `on delete set null`) est également
  écartée, faute de pouvoir l'attribuer à quelqu'un.
- **Regroupement** : plusieurs actions identiques (même acteur, même
  `type`, même tâche) le même jour sont fusionnées en une seule ligne avec
  un compte (ex. "Virgile a coché 2 éléments de la checklist de la tâche
  Courses" plutôt que deux lignes séparées) — évite de noyer le fil en cas
  d'actions répétées rapprochées. Le regroupement ne fusionne jamais deux
  tâches différentes entre elles, même par le même acteur.
- **Dédoublonnage avec « À ton attention »** (audit UX INC-7,
  10/09/2026) : `HomeDashboard` transmet à `ActivityFeed` l'ensemble
  `hiddenKeys` des `${task_id}|${type}` déjà représentés par une
  notification **non lue** (`task_shared` → `task_created`/`task_updated`,
  `comment_added` → `comment_added`) ; ces lignes sont masquées du fil
  d'activité pour ne pas afficher deux fois le même évènement pendant le
  court instant où la notification n'est pas encore lue.

Exemples de messages générés (formulations alignées sur celles des
notifications, voir 6.15) : « Anne-Françoise t'a partagé « Réserver le
gîte » », « Virgile a coché un élément de la checklist de la tâche
Courses de la semaine », « Nicolas a mis « Impôts » en « Terminée » ». Si
le fil est vide pour la journée, un état vide (`EmptyState`, voir 6.16)
s'affiche à la place plutôt que de faire disparaître la section.

### 6.13 Ajouter une tâche à son agenda (04/09/2026)

L'écran de détail d'une tâche **datée** affiche, à côté de l'icône crayon
« Modifier », une icône calendrier qui télécharge un fichier **`.ics`**
(iCalendar, RFC 5545). L'appareil l'ouvre alors dans son **application de
calendrier par défaut** — Apple Calendar sur iOS, l'agenda par défaut sur
Android, Outlook/Apple Calendar sur desktop… — qui propose d'ajouter
l'événement. Générique et indépendant de la plateforme (remplace, le
04/09/2026, un lien spécifique à Google Agenda).

- **Route** : `GET /api/tasks/[id]/calendar`
  (`src/app/api/tasks/[id]/calendar/route.ts`) — sous le middleware
  d'authentification, plus un contrôle d'accès à la tâche
  (`getTask(id, userId)` renvoie `null` sans droit → 404, comme
  si elle n'existait pas). Réponse : `Content-Type: text/calendar` +
  `Content-Disposition: attachment; filename="tache.ics"`.
- **Contenu** (`buildTaskICS()`, `src/lib/calendar.ts`, aucune dépendance —
  chaîne construite à la main) : un `VEVENT` avec `SUMMARY` = titre,
  `DESCRIPTION` = description + URL absolue de la tâche (reconstruite
  depuis les en-têtes `host` / `x-forwarded-proto`), `DTSTART` = échéance
  en UTC (suffixe `Z` — l'appli de calendrier reconvertit dans le fuseau
  de l'appareil), `DTEND` = +1 h.
- **Tâche sans échéance** : l'icône n'est pas affichée (rien à planifier) ;
  la route répond 404.
- **Accessible à tous ceux qui voient la tâche** (y compris en lecture
  seule) : c'est leur propre agenda, aucune écriture côté appli.
- **Copie ponctuelle** : une modification ultérieure de la tâche ne met
  pas l'événement à jour. La récurrence n'est pas transmise (évolution
  possible via une `RRULE` dans le `VEVENT`). Les lignes longues ne sont
  pas repliées (RFC §3.1) — toléré en pratique par les applis de
  calendrier courantes, à ajouter si l'une refuse.

### 6.14 Mon compte (`/compte`, 04/09/2026)

Écran accessible en cliquant sur son avatar dans la `Topbar`. Affiche
l'identité (prénom, rôle) et une section **« Modifier mon mot de passe »**
(`AccountPasswordForm.tsx` → `changePasswordAction`). Jusqu'ici le
changement de mot de passe n'était possible que depuis l'écran de
connexion.

`changePasswordAction` (`src/lib/actions.ts`) tire l'identité de la
session (pas d'un paramètre client), vérifie le mot de passe actuel, écrit
le nouveau hash, et **ne rouvre pas de session** : le cookie JWT est signé
avec `SESSION_SECRET`, indépendamment du mot de passe, donc il reste
valable. Renvoie `{ ok }` ou `{ error }` sans redirection.

Héberge aussi, depuis le 04/09/2026, la section **Notifications**
(`NotificationsToggle.tsx`) — voir 6.15.

### 6.15 Notifications « À ton attention » (`AttentionFeed`, 04/09/2026)

Fil affiché **sous les compteurs de l'écran d'accueil**, au-dessus de
« Activité du jour » (6.12). C'est le **miroir in-app des notifications** :
il existe indépendamment des push web et reste visible tant qu'il reste au
moins une notification **non lue**, que les push soient activés ou non.

**Modèle** : table `notifications` (migration `006_notifications.sql`) —
`user_id`, `type`, `task_id` (nullable, `on delete cascade`), `title`
(phrase prête à afficher), `body` (détail optionnel), `read_at`.

**Écriture** : `src/lib/notifications.ts`, appelé depuis les Server Actions
en même temps que `logActivity`, de façon non bloquante :

- `notifyUser({ userId, type, taskId?, title, body? })` — point
  d'entrée unique. Écrit la ligne `notifications`, **puis** appelle
  `sendPushToUser()` (`src/lib/push.ts`) pour envoyer un push web à chaque
  appareil où la personne a activé les notifications (table
  `push_subscriptions`, migration `007_push_subscriptions.sql`) — no-op
  silencieux tant qu'elle n'en a activé aucun. L'envoi et l'écriture sont
  chacun indépendamment non bloquants.
- `notifyTaskParticipants({ taskId, excludeUserId, … })` —
  fan-out vers créateur + assigné(e)s + lecteurs, moins l'auteur de
  l'action.

**Envoi du push** (`sendPushToUser()`, protocole Web Push standard —
RFC 8291/8292, aucun service tiers) : signe la requête avec les clés VAPID
(`NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`,
générées une fois avec `npx web-push generate-vapid-keys` — voir section
10) et purge automatiquement un abonnement mort (réponse 404/410).

**Activation côté client — opt-in strict, par appareil, rien par défaut**
(écran « Mon compte », `NotificationsToggle.tsx`) :

- **Détection** : appareil non compatible (`pushSupported()`,
  `src/lib/push-client.ts`) → message neutre. iOS dans Safari (pas
  installé, `isIos() && !isStandalone()`) → invite à ajouter l'appli à
  l'écran d'accueil (le push n'existe pas dans l'onglet Safari, seulement
  pour la PWA installée, iOS 16.4+). Permission déjà refusée par le
  navigateur → invite à la réactiver dans ses réglages.
- **Activer** : `Notification.requestPermission()` → si accordée,
  `pushManager.subscribe({ applicationServerKey })` avec la clé VAPID
  publique → l'abonnement est envoyé à `POST /api/push/subscribe`
  (upsert dans `push_subscriptions`, `onConflict: endpoint`).
- **Désactiver** : `subscription.unsubscribe()` côté navigateur puis
  `DELETE /api/push/subscribe`.
- `/api/push/subscribe` est une **Route Handler**, pas une Server Action :
  elle est aussi appelée par `public/sw.js` (voir plus bas), qui tourne
  hors du runtime React et ne peut invoquer aucune Server Action. Exclue
  du middleware d'authentification (voir 3 et `src/middleware.ts`, même
  raison que `/api/version`) — la session y est vérifiée directement,
  401 JSON si absente plutôt qu'une redirection qui casserait un `fetch()`
  attendant du JSON.

**Pastille de l'icône de l'appli (App Badge, 04/09/2026)** : affiche
**notifications non lues + tâches en retard dont l'utilisateur est
responsable** (créateur, ou assigné avec droit de modification —
`canEdit()`, `src/lib/access.ts`, pas les tâches en lecture seule ;
`isOverdue()` pour "en retard", `src/lib/format.ts` — même double
définition que les compteurs de l'accueil, voir 6.6). Calculée par
`getBadgeCount()` (`src/lib/queries.ts`, réutilise `getTasks()` déjà
filtré par `canView`) à deux moments :

- **Au chargement de l'écran d'accueil** (`HomeDashboard.tsx`) : calcul
  local, sans requête supplémentaire (`tasks`/`notifications` déjà chargés
  par la page) — `navigator.setAppBadge(total)` ou `clearAppBadge()` si 0.
  C'est ce qui remet la pastille à jour dès qu'on a lu ses notifications
  ou traité ses tâches en retard.
- **À chaque envoi de push** (`sendPushToUser()`, `src/lib/push.ts`) : le
  total à cet instant est inclus dans le payload (`badgeCount`), pour que
  la pastille soit juste même si l'appli n'a pas été rouverte depuis.

**Réception côté client** (`public/sw.js`) :

- `push` : affiche la notification système (`showNotification`, payload
  `{ title, body?, url, badgeCount? }`) et pose la pastille avec
  `navigator.setAppBadge(payload.badgeCount)` (PWA installée,
  Android/desktop et iOS 16.4+). Si `badgeCount` est absent (échec du
  calcul côté serveur), `setAppBadge()` sans argument affiche un
  indicateur générique plutôt que rien.
- `notificationclick` : referme la notification et va sur l'URL de la
  tâche concernée — focus un onglet déjà ouvert si possible, sinon en
  ouvre un.
- `pushsubscriptionchange` : réabonnement best-effort si le navigateur
  fait tourner l'endpoint (rare) ; en cas d'échec, l'abonnement mort sera
  simplement purgé par `sendPushToUser()` au prochain envoi.

**Événements couverts** — resserrés le 10/09/2026 (audit UX INC-7) à ce
qui est **adressé** à l'utilisateur : un changement de statut ou la
modification d'une tâche déjà accessible ne crée plus de notification (ni
push, ni pastille), ça n'apparaît plus que dans « Activité du jour » (voir
6.12).

| Type | Déclencheur | Destinataires |
|---|---|---|
| `task_shared` | `createTaskAction` (partage) / `updateTaskAction` (personne nouvellement ajoutée) | les personnes ajoutées |
| `task_deleted` | `deleteTaskAction` sur une tâche partagée | créateur + assigné(e)s, sauf l'auteur — notif sans lien (`task_id = null`, la tâche n'existe plus) |
| `comment_added` | `addCommentAction` sur une tâche partagée | participants sauf l'auteur |
| `due_soon` | `/api/cron/reminders` (Vercel Cron, 1×/jour) — tâche `todo`/`in_progress` dont l'échéance tombe aujourd'hui (jour civil de Paris) | créateur + assigné(e)s, **y compris sur une tâche privée** |

Les types `task_updated` et `status_changed` restent définis (des
notifications antérieures non lues peuvent encore en porter) mais ne sont
plus **émis**. `notifyTaskParticipants()` n'est donc plus appelé que par
`addCommentAction`.

*Création d'une tâche* : couverte par `task_shared` (« X t'a partagé
… »), envoyé à chaque personne avec qui la tâche est partagée dès sa
création — pas de type `task_created` distinct.

**Rappel d'échéance** (`src/app/api/cron/reminders/route.ts`, 04/09/2026) :
route déclenchée une fois par jour par **Vercel Cron** (`vercel.json`,
`0 7 * * *` — 07:00 UTC, ≈ 8-9h à Paris selon la saison), protégée par
`CRON_SECRET` (Vercel l'ajoute automatiquement en en-tête `Authorization`
à ses appels). Contrairement aux autres types, elle notifie **même le
créateur d'une tâche privée** : ce n'est pas l'action d'un tiers dont on
informe des participants, mais un rappel adressé à chacun. Un garde-fou
(pas de nouveau `due_soon` pour la même tâche dans les 20h précédentes)
évite un doublon si Vercel retentait l'appel. Exclue du middleware
d'authentification (voir 3), comme `/api/version` et `/api/push` : elle
n'est jamais appelée par un navigateur.

**Lecture / affichage** (`AttentionFeed.tsx`) : `getMyNotifications()`
(`src/lib/queries.ts`) ne renvoie **que les notifications non lues** (30
au plus, plus récentes d'abord) — une notif marquée lue **disparaît du
fil**, et la section entière disparaît quand il n'y a plus rien à lire.
Trois façons de marquer lu :

- le **bouton ✓** sur chaque ligne (`markNotificationReadAction(id)`,
  `useTransition` local, pas de gel d'écran) ;
- le **clic sur la notification** — va à `/tasks/[id]` **et** marque lu
  (appel non bloquant de `markNotificationReadAction` sur le `onClick` du
  lien) ;
- **« Tout marquer comme lu »** (`markNotificationsReadAction`, `read_at =
  now()` sur toutes les non lues de l'utilisateur).

Toutes filtrent par `user_id` : on ne peut marquer que ses propres
notifications. Chaque action fait `revalidatePath("/")`.

### 6.16 Suite d'audit UX (10/09/2026)

Un audit UX de l'ensemble de l'application (24 constats) a donné lieu à
une série de correctifs regroupés ici — **tous livrés**. Les
modifications les plus visibles :

**Navigation**

- **Barre d'onglets en bas d'écran sur mobile** (`BottomNav.tsx`, montée
  une fois dans `layout.tsx`) : Accueil · Tâches · Créer · Compte, avec
  `aria-current` sur l'onglet actif et `env(safe-area-inset-bottom)`.
  Masquée à partir de `sm` (le desktop garde le bandeau supérieur + le
  bouton flottant, lui devenu `sm:` uniquement). Se retire d'elle-même
  sur `/login`.
- **Tirer pour rafraîchir** (`PullToRefresh.tsx`, montée dans
  `layout.tsx`) : sur pointeur grossier, un tirage vers le bas depuis le
  haut de l'écran fait descendre un indicateur circulaire ; au-delà d'un
  seuil, `router.refresh()` relit les Server Components — une transition
  React (`useTransition`) garde l'indicateur affiché jusqu'à ce que le
  nouvel écran soit rendu. Le contenu n'est **pas** translaté (le faire
  casserait le positionnement des éléments `fixed` : bouton +, barre
  d'onglets). `overscroll-behavior-y: contain` (`globals.css`) neutralise
  le pull-to-refresh natif du navigateur mobile pour éviter le double
  déclenchement ; sans effet dans une PWA installée, qui n'a pas de geste
  natif.
- **Bandeau supérieur épuré sur mobile** : les liens « Tâches » et
  « Admin » passent en `sm:block` (doublon avec la barre du bas). « Espace
  admin » réapparaît alors sur `/compte` pour les administrateurs (`sm:hidden`).
- **Retour à la destination après connexion** : le middleware ajoute
  `?next=<chemin>` à la redirection vers `/login` ; `loginAction` /
  `setPasswordAction` y reviennent après authentification. `safeNextPath()`
  (`src/lib/nav.ts`) n'autorise qu'un chemin interne absolu (jamais une URL
  externe). Utile pour les liens profonds, notamment depuis une
  notification push.

**Retour d'action et suppressions**

- **Toasts** (`Toast.tsx`, `ToastProvider` monté dans `layout.tsx`) :
  messages éphémères en bas d'écran — « Tâche créée / enregistrée /
  supprimée », « Statut : … », « Commentaire ajouté ». Pour les actions
  qui redirigent côté serveur (création/modification), le message est
  déposé en `sessionStorage` (`checkberry:flash`, helper `setFlash()`) et
  ramassé par le provider au montage suivant.
- **Confirmation de suppression d'une tâche** : `ConfirmDialog.tsx` à la
  marque remplace `window.confirm()`.
- **Suppression annulable** des commentaires et des items de checklist
  (`useUndoableDelete.ts`) : l'élément disparaît immédiatement, un toast
  « … supprimé · Annuler » laisse ~5 s, l'appel serveur n'est envoyé qu'à
  l'expiration du délai (ou tout de suite si l'écran est quitté avant —
  flush au démontage).
- **UI optimiste** pour cocher un item de checklist (`ChecklistSection.tsx`,
  état local `overrides`) : la case réagit sans figer l'écran. Implémenté
  à la main, `useOptimistic` n'existant pas dans React 18.3.

**Pages système**

- `src/app/error.tsx`, `not-found.tsx`, `loading.tsx` — à la marque
  (fond `paper`, `IconBerry`, retour à l'accueil). Sans `error.tsx`, une
  exception levée par une Server Action affichait l'écran d'erreur brut de
  Next.

**Formulaire de tâche**

- Raccourcis d'échéance « Ce soir / Demain matin / Ce week-end »
  (`dueDatePreset()`) — voir 6.3.
- Avertissement « récurrence sans échéance » — voir 6.3.

**Accessibilité et dates**

- Anneau `:focus-visible` global (`globals.css`), `aria-label` sur tous
  les contrôles à icône seule, `aria-pressed` + `role="group"` sur les
  pilules de filtre / catégorie / statut, contrôle segmenté pour la
  visibilité, coche sur les multi-sélections actives, cibles tactiles
  portées vers 44 px (utilitaire `.tap-target`).
- Composant `Time.tsx` : enveloppe `<time datetime="…">` autour des dates
  affichées.
- `min-h-dvh` au lieu de `min-h-screen` ; `env(safe-area-inset-*)` sur le
  bouton flottant et le bandeau supérieur.
- `formatDate()` ajoute l'année quand elle diffère de l'année courante ;
  `relativeTime()` plafonne à « hier / il y a n j » sur 7 jours puis
  bascule sur une date absolue (`formatDateOnly()`) — voir 8.1.

**Découverte des notifications**

- `NotificationsNudge.tsx` : bannière unique et rejetable sur l'accueil
  (au-dessus de « À ton attention »), affichée seulement si le push est
  réellement activable ici et pas déjà en place. Rejet mémorisé
  (`localStorage`, `checkberry:notif-nudge-dismissed`).

**Fils de l'accueil**

- **Deux fils rendus disjoints** (INC-7) : « À ton attention » ne notifie
  plus (donc plus de push ni de pastille) que ce qui est **adressé** à
  l'utilisateur — `task_shared`, `task_deleted`, `comment_added`,
  `due_soon`. Un changement de statut ou la modification d'une tâche déjà
  accessible ne crée plus de notification : c'est de l'ambiance, ça
  n'apparaît que dans « Activité du jour » (via `logActivity`, inchangé).
  Filet de sécurité : `HomeDashboard` construit l'ensemble
  `${task_id}|${type}` des évènements déjà couverts par une notification
  non lue et `ActivityFeed` masque ces lignes — pas de doublon visible
  pendant le court instant où la notification n'est pas encore lue. Les
  formulations des deux fils sont alignées.
- **Fil « Partagées avec toi »** (`SharedWithYouFeed.tsx`, UX-12) : liste
  **pérenne** des tâches ouvertes (à faire / en cours) où l'utilisateur
  est en **lecture seule** — absentes des compteurs et de la portée par
  défaut de la liste, donc invisibles autrement. Affiche les **3 plus
  urgentes** (en retard d'abord, puis par échéance croissante, sans
  échéance en dernier) + un lien « Voir tout » vers `/tasks?readOnly=1`
  (voir 6.7). Une tâche n'en sort que lorsqu'elle est terminée / archivée.
- **Salutation selon l'heure** de Paris (UX-14) : « Bonsoir » de 18 h à
  5 h, « Bonjour » le reste de la journée.

**Cohérence visuelle**

- **Boutons « Ajouter »** harmonisés (INC-2) : plein identique pour
  l'ajout principal d'un bloc (commentaire, item de checklist), contour
  pour l'ajout secondaire dans un champ composite (nouveau tag).
- **État vide unifié** (`EmptyState.tsx`, INC-4) : un seul traitement
  (encadré pointillé, texte centré estompé) pour les sections qui restent
  affichées même vides — liste de tâches, commentaires, checklist,
  activité du jour. Les fils de type boîte de réception (« À ton
  attention », « Partagées avec toi ») continuent, eux, à disparaître
  quand ils sont vides.
- **Tâche archivée** (INC-8) : même traitement atténué qu'une tâche
  terminée dans la liste — titre grisé barré + carte à 60 % d'opacité.
- **Bandeau « Filtré depuis l'accueil · Réinitialiser »** (INC-9) :
  affiché sur `/tasks` quand on arrive via une tuile ou un lien
  (`cameFromTile`), pour expliquer d'où vient le filtrage courant ;
  « Réinitialiser » remet tous les filtres à leur valeur par défaut.

**Saisie**

- **Champ commentaire** (`CommentForm.tsx`, UX-13) : `<textarea>` à
  hauteur automatique (1 → ~6 lignes puis défilement), envoi par
  `Ctrl/Cmd+Entrée` (Entrée insère un retour à la ligne), plus de
  `required` natif (dépareillé avec les erreurs inline de l'appli).

**Icône**

- `IconCalendarPlus` distincte pour l'export agenda sur l'écran de détail,
  pour ne plus réutiliser l'icône d'échéance avec deux sens différents.

### 6.17 Gamification — streaks et défi de la semaine (12/09/2026)

Premier lot de gamification, en deux volets indépendants : un **streak
personnel** (assiduité individuelle) et un **défi familial hebdomadaire**
(objectif collectif sur les tâches partagées). Test en conditions réelles
jusqu'à ~20/09/2026.

**Streak personnel** (`src/lib/streaks.ts`, `computeStreak()`) — jours
consécutifs d'activité de l'utilisateur, **toutes tâches confondues,
privées comme partagées** (contrairement à `activity_log`, jamais
alimenté pour une tâche privée — voir 6.12). Alimenté par
`logUserActivity(userId)` (`src/lib/actions.ts`), qui insère une ligne
minimale dans `user_activity_log` (`user_id`, `created_at` — voir 5.2)
sans référence de tâche ni contenu, pour ne jamais pouvoir fuiter une
information privée si cette table venait un jour à être affichée ailleurs
que sous forme de compte. Actions qui comptent comme « jour actif » :
créer une tâche (`createTaskAction`), clôturer une tâche
(`setStatusAction`, seulement vers `done`), ajouter un commentaire
(`addCommentAction`), ajouter un item de checklist
(`addChecklistItemAction`), **cocher** un item de checklist
(`toggleChecklistItemAction`, seulement `done → true` : décocher, qui
sert à corriger une erreur, ne compte pas).

`computeStreak(activeDays, todayKey)` parcourt les jours en arrière depuis
aujourd'hui (borné à 400 jours, `MAX_LOOKBACK_DAYS`) : un jour actif
incrémente le compteur ; un jour inactif consomme **une grâce par semaine
civile** (lundi-dimanche, Paris) si elle n'a pas déjà servi cette
semaine-là, sinon le streak s'arrête. Aujourd'hui n'est jamais compté
comme un échec s'il est encore inactif — la journée n'est simplement pas
terminée. Limite acceptée : la grâce étant par semaine civile et non par
fenêtre glissante, un trou à cheval sur une frontière de semaine
(dimanche + lundi) peut être pardonné deux fois de suite.

Affiché (`StreakBadge`, `src/components/Badge.tsx`, 🔥 + nombre,
seulement si > 0 — pas de pastille « 🔥 0 ») à trois endroits, chacun
recalculant `computeStreak()` à partir de `getUserActiveDays()`
(`src/lib/queries.ts`) :

- **Écran d'accueil** (`HomeDashboard.tsx`) — à côté de la salutation,
  streak de l'utilisateur connecté.
- **« Mon compte »** (`/compte`) — même donnée, dans le résumé du profil.
- **Onglet « Membres » de l'admin** (`UserManager.tsx`) — le streak de
  **chaque** membre à côté de son nom (`getMembers()`, qui calcule les
  streaks de tout le monde en une seule requête groupée plutôt qu'un
  `getUserActiveDays()` par membre — voir `getAllUserActiveDays()` dans
  `queries.ts`), donnant à la famille une vue d'ensemble plutôt que
  chacun ne voyant que le sien.

**Défi familial hebdomadaire** (`src/lib/challenges.ts`,
`ChallengeCard.tsx` sur l'écran d'accueil) — un objectif collectif par
semaine (lundi-dimanche, Paris), calculé à partir des **tâches
partagées** et du journal d'activité **uniquement** (jamais des tâches
privées d'un membre). `WEEKLY_CHALLENGES` est une liste **fixe, rédigée à
l'avance** (pas de génération dynamique) : 9 semaines, du 14/09 au
15/11/2026 (« Rentrée sereine », « Zéro retard », « Équipe complète », «
On papote », « Créateurs actifs », « Grand ménage », « Check-list en
béton », « Sans dernière minute », « Le combo final ») ; `null` hors de
cette période. `getCurrentChallenge(todayKey)` sélectionne l'entrée dont
la semaine couvre aujourd'hui.

Chaque défi porte une `metric` typée (`ChallengeMetric`,
`src/lib/types.ts`), évaluée par `evaluateMetric()`/`evaluateChallenge()`
à partir de trois sources chargées côté serveur (`src/app/page.tsx`) :
l'activité de la semaine (`getFamilyWeekActivity()`), un instantané des
tâches partagées (`getSharedTasksSnapshot()`) et, seulement si la métrique
en a besoin (`challengeNeedsMembers()`, évite une requête `getProfiles()`
pour rien la plupart des semaines), la liste des membres du foyer. Types
de métrique : `activity_count` (compter des lignes `activity_log` d'un
type donné, avec dédoublonnage par tâche optionnel — ex. « 10 tâches
complétées »), `distinct_active_days` (jours distincts avec au moins une
activité d'un type donné), `zero_overdue_shared` (aucune tâche partagée
en retard, calculé sur l'instantané, pas sur l'activité),
`full_team_daily_completion` (chaque membre a clôturé au moins une tâche
chaque jour déjà écoulé de la semaine), et `combo` (plusieurs métriques,
réussi seulement si toutes le sont — utilisé pour le défi final).

`ChallengeCard.tsx` est purement présentationnel : la progression arrive
déjà calculée (`ChallengeProgress` — `current`/`target`/`success`/`label`,
plus `parts[]` pour un `combo`, un sous-composant `ProgressBar` par
partie). Affiche titre, description, jours restants dans la semaine (ou
« Réussi ✅ »), et une ou plusieurs barres de progression.

## 7. Routes de l'application

| Route | Contenu |
|---|---|
| `/login` | Grille des profils + connexion / première connexion / changement de mot de passe ; honore `?next=` (voir 4) |
| `/` | Écran d'accueil (bienvenue, compteurs, fil « À ton attention » — 6.15, activité du jour — 6.12) |
| `/tasks` | Liste des tâches (recherche + volet de filtres, voir 6.7) |
| `/tasks/new` | Formulaire de création |
| `/tasks/[id]` | Détail d'une tâche (statut, assignés/lecteurs, tags, checklist, commentaires, icône « Ajouter à mon agenda » si datée) — 404 si l'utilisateur n'a pas `canView` |
| `/tasks/[id]/edit` | Formulaire de modification — 404 si l'utilisateur n'a pas `canEdit` |
| `/compte` | Mon compte : identité, « Modifier mon mot de passe » et activation des notifications (voir 6.14) |
| `/admin` | Statistiques par utilisateur (voir 6.9) — 404 si le compte n'a pas le rôle `admin` |
| `/api/version` | Repère de version pour le rafraîchissement automatique (voir 6.8) — pas une page, aucune UI |
| `/api/tasks/[id]/calendar` | Fichier `.ics` de la tâche pour l'agenda de l'appareil (voir 6.13) — 404 si l'utilisateur n'a pas `canView` ou si la tâche n'a pas d'échéance |
| `/api/push/subscribe` | `POST`/`DELETE` : enregistre/supprime l'abonnement push de l'appareil courant (voir 6.15) — pas une page, aucune UI |
| `/api/cron/reminders` | Rappel quotidien d'échéance (Vercel Cron, voir 6.15) — pas une page, aucune UI |

Toutes les routes sauf `/login`, `/api/version`, `/api/push/subscribe` et
`/api/cron/reminders` exigent une session valide (appliqué par le
middleware — ces deux dernières s'authentifient elles-mêmes, voir 6.15) ;
`/tasks/[id]` et `/tasks/[id]/edit`
exigent en plus les droits d'accès décrits en 6.1, et `/admin` exige le
rôle `admin` (voir 6.9), vérifiés côté serveur indépendamment de toute
navigation dans l'UI. La racine `/` a hébergé la
liste des tâches jusqu'au 01/09/2026 ; elle héberge désormais l'écran
d'accueil, et la liste a déménagé vers `/tasks` (voir
`claude/prototype-notes.md` pour l'historique de ce changement et la
liste des redirections mises à jour en conséquence).

## 8. Limites connues et points d'attention

### 8.1 Fuseau horaire (refonte du 04/09/2026)

**L'appli est désormais explicitement en Europe/Paris** de bout en bout —
`src/lib/timezone.ts`, constante `APP_TIMEZONE`. Les instants restent
stockés en UTC (`tasks.due_at` est un `timestamptz`) ; toute la conversion
"heure murale de Paris ⇄ instant UTC" est centralisée :

- **Saisie** : `parisWallTimeToUtcIso()` interprète la valeur du
  `<input datetime-local>` comme une heure de Paris avant de la stocker
  (`createTaskAction` / `updateTaskAction`, `src/lib/actions.ts`).
- **Affichage** : `formatDate()` force `timeZone: "Europe/Paris"` (elle
  tourne côté serveur, donc à l'heure de Vercel/UTC sans ça). Depuis le
  10/09/2026 elle ajoute l'**année** quand celle-ci diffère de l'année
  courante (à Paris), et `relativeTime()` ne renvoie « il y a n j » que
  jusqu'à 7 jours (« hier » à 1 jour) avant de basculer sur une date
  absolue via `formatDateOnly()` — « 47 j » ne disait plus rien.
- **Pré-remplissage du formulaire** : `toDatetimeLocalValue()` reconvertit
  l'instant UTC vers l'heure de Paris via `Intl`, quel que soit le fuseau
  du navigateur.
- **Clés de jour civil** (`dateKeyFromDate` / `upcomingSunday` — tuiles
  "aujourd'hui"/"cette semaine", filtre d'échéance, fil d'activité du
  jour) : calculées dans le fuseau Paris via `Intl`, côté serveur comme
  côté client. `isOverdue()` compare deux instants, il est
  indépendant du fuseau.

Le changement d'heure été/hiver (CET +1 / CEST +2) est géré
automatiquement par `Intl` et par `AT TIME ZONE 'Europe/Paris'` côté
Postgres — aucun décalage codé en dur.

**Avant cette refonte**, saisie et affichage étaient tous deux naïfs :
"18:00" saisi était stocké `18:00Z` et réaffiché "18:00", les deux erreurs
se compensant dans l'appli mais pas ailleurs (événement d'agenda, §6.13).
Les 12 échéances déjà en base ont été réalignées le 04/09/2026 par
`supabase/fix_due_at_timezone_2026-09-04.sql` (script ponctuel, à ne pas
rejouer).

**Reste une limite mineure** : `computeNextOccurrence()` (régénération
d'une tâche récurrente, `src/lib/format.ts`) décale l'échéance en UTC —
une occurrence qui franchit un changement d'heure peut dériver d'1 h en
heure murale de Paris. Sans conséquence pratique (tâches récurrentes,
±1 h, deux fois par an).

### 8.2 Quatre pièges de cache déjà rencontrés et corrigés

Résumé pour mémoire, en cas de nouveau symptôme d'affichage périmé après
création, modification ou suppression d'une tâche :

1. **Rendu statique** — une page sans appel à une "dynamic function"
   (`cookies()`, etc.) peut être pré-rendue au build et figer ses
   données. Corrigé par `export const dynamic = "force-dynamic"` sur
   chaque page qui affiche des données mutables.
2. **Data Cache de `fetch()`** — Next.js met en cache les requêtes GET
   faites via `fetch()`, y compris celles du driver Neon (HTTP sous le
   capot), même sur une page dynamique. Corrigé une fois pour toutes dans
   `src/lib/db.ts` (`fetchOptions: { cache: "no-store" }` forcé sur
   `neon()` — même principe qu'avant sur `src/lib/supabase/admin.ts`,
   reporté lors de la migration Neon du 11/09/2026).
3. **Client Router Cache** — le navigateur réutilise jusqu'à 30s le rendu
   déjà récupéré pour une URL visitée en navigation douce (`<Link>`).
   Corrigé par `experimental.staleTimes.dynamic = 0` dans
   `next.config.mjs`.
4. **Cache du Service Worker PWA (02/09/2026, en dehors de Next.js).**
   `public/sw.js` interceptait toute requête GET (pages *et* données RSC)
   avec une stratégie "cache d'abord" : la page était systématiquement
   resservie depuis un instantané périmé, le réseau ne mettant à jour le
   cache que pour la navigation suivante — d'où la nécessité de
   rafraîchir pour voir un changement, malgré les trois correctifs
   ci-dessus déjà en place. Corrigé en restreignant le service worker aux
   seuls fichiers réellement statiques de l'app shell (`manifest.json`,
   icônes) ; toute page ou donnée passe désormais toujours par le réseau.
   Nom de cache incrémenté (`v2`, puis `checkberry-shell-v3` lors du
   renommage/rethème du 04/09/2026 — voir 9 — car `manifest.json` et les
   icônes de l'app shell avaient changé) pour purger l'ancien cache chez
   les utilisateurs déjà installés, et `Cache-Control: no-cache` ajouté
   sur `/sw.js` (`next.config.mjs`) pour que les futures mises à jour du
   service worker soient détectées sans délai.

Les trois premiers sont spécifiques à Next.js (rendu serveur/CDN et
navigation React) ; le quatrième vit entièrement dans le navigateur, en
dehors du contrôle de Next.js — à vérifier en priorité si un nouveau
symptôme de ce type apparaît malgré les correctifs 1 à 3.

**À distinguer du gel d'écran global (section 6.11)** : les quatre pièges
ci-dessus concernent la fraîcheur des *données* affichées après une
mutation ; le gel d'écran ne change rien à cette fraîcheur, il empêche
seulement l'utilisateur d'interagir avec l'écran *pendant* qu'une mutation
est en cours de traitement.

### 8.3 Zoom automatique iOS Safari sur les champs (12/09/2026)

Safari iOS zoome automatiquement la page au focus d'un champ dont le
texte affiché fait moins de 16px — et ne dézoome pas toujours de façon
fiable ensuite, en particulier quand le champ reste monté pendant un
`router.refresh()`/`redirect()` (écran qui reste "zoomé" après avoir
ajouté un item de checklist, un commentaire, ou enregistré une tâche).
Tous les champs de l'appli sont volontairement plus petits que 16px pour
une densité mobile correcte (13.5-14.5px, classes Tailwind du type
`text-[13.5px]` sur chaque `<input>`/`<textarea>`/`<select>`).

**Fix, en deux temps** (`src/app/globals.css`, `ChecklistSection.tsx`,
`CommentForm.tsx`, `TaskForm.tsx`) :

1. Sous 640px (breakpoint `sm` de Tailwind), tous les champs passent à
   16px via une règle globale dans `globals.css`, pour empêcher le zoom
   de se déclencher — `blur()` explicite avant le rafraîchissement/la
   navigation en complément, pour fermer le clavier proprement.
2. **Cette règle globale doit porter `!important`.** Premier essai sans
   (commit `cefac59`, 12/09/2026) : silencieusement perdant, le zoom
   revenait malgré tout. Cause : chaque champ porte déjà sa propre classe
   Tailwind de taille (`text-[13.5px]`), et une classe a une spécificité
   CSS plus forte (0,1,0) qu'un sélecteur de balise `input` (0,0,1),
   quel que soit l'ordre des règles dans la feuille de style ou
   l'imbrication en `@media`. Sans `!important`, le champ restait sous
   16px et le zoom persistait — repéré par l'utilisateur en testant sur
   son iPhone après le premier correctif, corrigé dans la foulée (commit
   `a709109`).

**Leçon pour tout futur correctif du même genre** : une règle CSS globale
censée l'emporter sur les classes Tailwind posées composant par
composant doit soit porter `!important` (scopée étroitement — une seule
propriété, une intention claire), soit avoir une spécificité au moins
égale à une classe. Vérifier le style **calculé** dans le navigateur
(`getComputedStyle`), ne pas se fier à la lecture du CSS seul.

### 8.4 Faille de confidentialité initiale — corrigée le 01/09/2026

Une version antérieure de l'application ne filtrait les tâches privées
que sur l'onglet dédié "Privées" : l'onglet "Toutes" (par défaut) et la
page de détail `/tasks/[id]` ne les excluaient pas, ce qui rendait une
tâche privée d'un autre membre visible dans la liste et accessible par
son URL directe. Ce point a été corrigé par la refonte du modèle de
confidentialité/partage décrite en 6.1 : l'accès est désormais vérifié à
la **requête** (`getTasks`/`getTask`) et non plus seulement à
l'affichage, et de la même façon pour chaque Server Action de mutation.
Conservé ici pour mémoire.

### 8.5 Fonctionnalités non implémentées

Conformément au phasage du cahier des charges :

- Offline-first réel (file d'attente IndexedDB + réconciliation à la
  reconnexion) — le service worker (`public/sw.js`) ne gère que le cache
  de l'app shell (installabilité PWA) et les notifications push (voir
  6.15), pas les mutations créées hors-ligne.

Les **notifications Web Push + pastille d'icône** et l'**interface
d'administration des comptes** (initialement listées ici) sont désormais
implémentées — voir 6.15 et 6.9.

## 9. Charte graphique — thème « Checkberry » (04/09/2026)

L'appli s'appelle **Checkberry**. Le thème est passé d'un accent orange
sur fond écru à un **accent rose framboise sur fond blanc**.

Palette définie dans `tailwind.config.ts` :

- **Accent** `brand` : `#D6336C` (DEFAULT), `#A12552` (`dark`, texte sur
  fond pâle), `#F06595` (`light`), `#FBE0EA` (`soft`, fonds pâles).
- **Fond** : `paper` / `surface` = blanc (`#FFFFFF`) ; `sand` `#F5ECF0`
  (fonds neutres/hover, chips), `line` `#E9DEE4` / `line-soft` `#F3ECEF`
  (bordures) — neutres très légèrement teintés rose, pas de gris froid.
- **Texte** `ink` : `#241A20` (DEFAULT), `#867A80` (`muted`).
- **Alerte / danger** : `red-*` de Tailwind (`red-600` `#DC2626` pour
  « En retard », « Privée », erreurs de formulaire, bouton Supprimer) —
  volontairement **distinct** du rose de la marque, pour que l'alerte se
  lise comme telle. **Succès** : `emerald-*` (visibilité « Partagée »,
  confirmation de mot de passe, toasts de succès). **Avertissement** :
  `amber-*` (récurrence sans échéance).

`src/app/globals.css` ajoute, en plus des `@tailwind`, quelques
utilitaires transverses : anneau `:focus-visible` global (accent
`brand`), marges de sécurité iOS (`pb-safe` / `pt-safe` / `bottom-safe`,
`env(safe-area-inset-*)`), `.tap-target` (zone tactile ≥ 44 px autour
d'une petite icône), `overscroll-behavior-y: contain` sur `body` (voir
« tirer pour rafraîchir », 6.8) et une règle `font-size: 16px !important`
sur tous les champs sous 640px (anti-zoom iOS Safari, voir 8.3). Les
pages utilisent `min-h-dvh` (et non `min-h-screen`) pour composer avec
les barres d'outils mobiles rétractables. Voir 6.16.

Icônes : jeu SVG inline maison (`src/components/Icons.tsx`, trait fin,
couleur pilotée par `currentColor`). Exception : `IconBerry`, le logo
Checkberry (framboise blanche + coche rose sur carré framboise), autonome
en couleurs — même dessin que l'icône PWA (`scripts/gen-icons.js`, via
`sharp` en devDependency). Icônes PWA regénérables :
`node scripts/gen-icons.js` — produit `public/icons/icon-192.png` et
`icon-512.png` (manifest / écran d'accueil) **et** `src/app/icon.png`
(favicon de repli 48 px). Le favicon principal est `src/app/icon.svg`
(même dessin, vectoriel, écrit à la main) : l'App Router détecte
`src/app/icon.svg` et `src/app/icon.png` et génère automatiquement les
`<link rel="icon">` ; `src/middleware.ts` les exclut de la vérification
de session. `layout.tsx` ne déclare plus que l'icône `apple-touch`
(192 px) dans `metadata.icons`.

## 10. Workflow de développement et de déploiement

- **Copie de travail locale, Claude commit/push lui-même** (flux actuel).
  Une session Claude Code clone le dépôt (public depuis le 03/09/2026),
  modifie le code localement, vérifie (voir ci-dessous), puis exécute
  elle-même `git add`/`commit`/`push` sur `main` quand un lot cohérent est
  prêt et que la vérification passe — identité git `nicolasdalmont`
  (`nicolas.dalmont@laposte.net`), commits par lots logiques, messages en
  français, jamais de rewrite de l'historique `main`. **Chaque push sur
  `main` déclenche un déploiement Vercel production immédiat** — pas
  d'étape de revue intermédiaire, la vérification doit donc être faite
  *avant* de pousser, pas après. Avec `DATABASE_URL` renseignée dans
  `.env.local` (voir README), le serveur dev local (`npm run dev`)
  fonctionne aussi contre la vraie base Neon — utile pour un test manuel
  avant de pousser.
  > Historique : jusqu'au 03/09/2026, le dépôt était privé et le code
  > livré en `.zip` que l'utilisateur déposait sur GitHub via l'interface
  > web ("Add file → Upload files"), sans `git` ni copie locale — une
  > session cloud ne pouvant pas pousser directement. Ce mode de
  > livraison n'est plus utilisé.
- **Vérifier avant de pousser** : `npx tsc --noEmit` (le projet est en
  `strict: true` sans exception, voir `tsconfig.json`) puis `npm run
  build`. Tuer `next dev` avant un `npm run build` (sinon `.next` peut se
  corrompre — les deux écrivent dans le même dossier). Pour une
  vérification visuelle, démarrer/relancer `npm run dev` (après avoir
  arrêté un build en cours) plutôt que de supposer qu'un changement UI
  fonctionne.
- **Évolutions du schéma de base** : toujours via un nouveau fichier
  numéroté dans `db/migrations/` (additif : `add column if not exists`,
  `create table if not exists`, jamais de `drop`), exécuté à la main
  (SQL Editor Neon ou `psql "$DATABASE_URL" -f ...`) — jamais en
  réexécutant `db/neon_schema.sql`, qui est un reset destructeur pour la
  base en fonctionnement normal (voir 5.1). Penser à répercuter chaque
  migration dans `neon_schema.sql` pour qu'il reste le reflet fidèle de
  la structure. Migrations à ce jour : `001_user_activity_log.sql`.
  (Historique pré-Neon, non maintenu depuis le 11/09/2026 :
  `supabase/migrations/` `001_categories_and_tags.sql` à
  `009_categories.sql` — voir 5.1.)
- **Variables d'environnement** (Vercel → Project Settings → Environment
  Variables, type "Secret") : `DATABASE_URL` (chaîne **pooled** Neon —
  Connection Details du dashboard Neon, host `...-pooler...`),
  `SESSION_SECRET` (chaîne aléatoire générée une fois, ex. `openssl rand
  -base64 48`), et depuis les notifications push (voir 6.15)
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (générées une fois
  avec `npx web-push generate-vapid-keys`) et `VAPID_SUBJECT`
  (`mailto:quelqu'un@exemple.fr`). Détail dans `.env.example` et
  `README.md`. **Piège rencontré pendant la migration Neon** : une
  rotation de mot de passe Neon invalide `DATABASE_URL` dans son
  intégralité (pas seulement le mot de passe isolé) — après une
  rotation, toujours régénérer la chaîne complète depuis le dashboard
  Neon plutôt que de tenter un montage manuel.

## 11. Inventaire des fichiers principaux

| Fichier | Rôle |
|---|---|
| `src/middleware.ts` | Garde d'authentification (Edge) — redirige vers `/login?next=…` (voir 4) |
| `src/lib/nav.ts` | `safeNextPath()` — valide la destination `?next=` (chemin interne uniquement) |
| `src/lib/auth.ts` | Hash de mot de passe, session JWT |
| `src/lib/access.ts` | Contrôle d'accès aux tâches (`canView`/`canEdit`/`computeVisibility`/`getTaskAccess`) |
| `src/lib/db.ts` | `sql` — client Neon (`@neondatabase/serverless`, `DATABASE_URL`, `cache: "no-store"`) |
| `src/lib/queries.ts` | Lectures (profils, membres — `getMembers`, tâches, tags, commentaires, stats admin, activité, notifications — `getMyNotifications`, pastille — `getBadgeCount`) — filtrées par `access.ts` |
| `src/lib/actions.ts` | Server Actions (écritures : auth + mot de passe, tâches, tags, commentaires, checklist, journal d'activité — `logActivity`, notifications lues) — vérifiées par `access.ts` |
| `src/lib/admin-actions.ts` | Server Actions de gestion des comptes (créer / réinitialiser / supprimer un membre) — `requireAdmin()` (voir 6.9) |
| `src/lib/temp-password.ts` | `generateTempPassword()` — mot de passe temporaire lisible (voir 6.9) |
| `src/lib/avatar-colors.ts` | Palette + `pickAvatarColor()` — couleur d'avatar à la création d'un membre |
| `src/lib/types.ts` | Types TypeScript partagés (dont `ActivityType`, `NotificationType`, `NotificationItem`) |
| `src/lib/format.ts` | Formatage de dates (heure de Paris, année si ≠ année courante), `relativeTime` plafonné, statuts, récurrence, clés de jour civil, `dueDatePreset()` (raccourcis d'échéance) |
| `src/lib/timezone.ts` | `APP_TIMEZONE` (Europe/Paris) + conversions heure murale de Paris ⇄ instant UTC (voir 8.1) |
| `src/lib/calendar.ts` | `buildTaskICS()` — génère le fichier `.ics` d'une tâche pour l'agenda de l'appareil (voir 6.13) |
| `src/app/api/tasks/[id]/calendar/route.ts` | Sert ce `.ics` (`Content-Disposition: attachment`) — accès vérifié par `getTask` (voir 6.13) |
| `src/lib/categories.ts` | Catégories : `CATEGORY_ICON_CHOICES` (icônes + couleur + fond pastel), résolution icône/couleur, repli/défauts (voir 6.2) |
| `src/lib/category-actions.ts` | Server Actions CRUD catégories (admin, voir 6.9) |
| `src/components/CategoryManager.tsx` | Onglet « Catégories » de l'admin — liste, création, édition, réordonnancement (voir 6.9) |
| `src/components/Icons.tsx` | Jeu d'icônes SVG inline (dont `IconCalendarPlus` — export agenda) |
| `src/components/Time.tsx` | Enveloppe `<time datetime>` autour d'une date affichée (voir 6.16) |
| `src/components/TaskForm.tsx` | Formulaire création/modification de tâche, sélecteur de partage, raccourcis d'échéance, confirmation de suppression |
| `src/components/TaskFilterList.tsx` | Recherche (toujours visible) + volet dépliable "Filtres" replié par défaut (portée/statuts/catégorie/intervalle d'échéance `du…au`/visibilité segmentée/en retard/tags), `aria-pressed` sur les pilules, filtre mémorisé en `sessionStorage` (voir 6.7) |
| `src/components/HomeDashboard.tsx` | Salutation + compteurs de l'accueil (en retard/aujourd'hui/cette semaine, liens vers un intervalle exact) ; calcule le dédoublonnage des fils et la liste « Partagées avec toi » (voir 6.6, 6.16) |
| `src/components/NotificationsNudge.tsx` | Bannière unique d'invite à activer les notifications, sur l'accueil (voir 6.16) |
| `src/components/SharedWithYouFeed.tsx` | Fil « Partagées avec toi » de l'accueil — tâches en lecture seule (voir 6.16) |
| `src/components/ActivityFeed.tsx` | Fil "Activité du jour" de l'accueil — dédoublonné avec « À ton attention » (voir 6.12) |
| `src/components/EmptyState.tsx` | État vide unifié des sections qui restent affichées même vides (voir 6.16) |
| `src/components/LoginForm.tsx` | Écran de connexion / première connexion |
| `src/app/compte/page.tsx` + `src/components/AccountPasswordForm.tsx` | Écran « Mon compte » : changement de mot de passe connecté (voir 6.14) |
| `src/lib/notifications.ts` | `notifyUser()` / `notifyTaskParticipants()` — écriture des notifications + déclenchement du push ; ne couvre plus que `task_shared` / `task_deleted` / `comment_added` (voir 6.15) |
| `src/lib/push.ts` | `sendPushToUser()` — envoi Web Push (clés VAPID), purge des abonnements morts (voir 6.15) |
| `src/lib/push-client.ts` | Utilitaires navigateur : abonnement/désabonnement, détection support et iOS non installé (voir 6.15) |
| `src/components/AttentionFeed.tsx` | Fil « À ton attention » sous les compteurs de l'accueil (voir 6.15) |
| `src/components/NotificationsToggle.tsx` | Activation/désactivation des notifications sur l'écran « Mon compte » (voir 6.15) |
| `src/app/api/push/subscribe/route.ts` | Enregistre/supprime l'abonnement push de l'appareil courant (voir 6.15) |
| `src/app/api/cron/reminders/route.ts` | Rappel quotidien d'échéance, appelé par Vercel Cron (voir 6.15) |
| `vercel.json` | Déclare le Cron Job (`/api/cron/reminders`, 1×/jour) |
| `public/sw.js` | App shell + handlers `push`/`notificationclick`/`pushsubscriptionchange` (voir 6.15) |
| `src/components/ServiceWorkerRegister.tsx` | Enregistrement du service worker + revérification à chaque retour au premier plan |
| `src/components/AppUpdateWatcher.tsx` | Rafraîchissement automatique à l'ouverture si une nouvelle version est déployée (voir 6.8) |
| `src/components/PullToRefresh.tsx` | Tirer vers le bas pour rafraîchir (`router.refresh()`), mobile uniquement (voir 6.8, 6.16) |
| `src/app/api/version/route.ts` | Repère de version interrogé par `AppUpdateWatcher.tsx` |
| `src/app/admin/page.tsx` | Écran d'administration, réservé au rôle admin — charge membres + stats (voir 6.9) |
| `src/components/AdminScreen.tsx` | Bascule d'onglets « Membres » / « Activité » de l'écran admin |
| `src/components/UserManager.tsx` | Onglet « Membres » : créer / réinitialiser / supprimer un compte (voir 6.9) |
| `src/components/UserStatsList.tsx` | Onglet « Activité » : statistiques par membre (voir 6.9) |
| `src/components/ChecklistSection.tsx` | Checklist d'une tâche sur l'écran de détail — coche optimiste, suppression annulable (voir 6.10, 6.16) |
| `src/components/PendingOverlay.tsx` | Gel d'écran global + indicateur de traitement en cours (voir 6.11) |
| `src/components/Toast.tsx` | Toasts en bas d'écran + `setFlash()` (message qui survit à un redirect serveur) — voir 6.16 |
| `src/components/ConfirmDialog.tsx` | Boîte de confirmation à la marque (remplace `window.confirm()`) — voir 6.16 |
| `src/components/useUndoableDelete.ts` | Hook « supprimer + Annuler » (commentaires, items de checklist) — voir 6.16 |
| `src/components/BottomNav.tsx` | Barre d'onglets en bas d'écran, mobile uniquement (voir 6.16) |
| `src/components/CommentThread.tsx` | Fil de commentaires + suppression annulable (auteur ou créateur de la tâche — voir 6.5, 6.16) |
| `src/components/CommentForm.tsx` | Saisie d'un commentaire — `<textarea>` auto, envoi Ctrl/Cmd+Entrée (voir 6.5) |
| `src/app/error.tsx` / `not-found.tsx` / `loading.tsx` | Pages système à la marque (voir 6.16) |
| `db/neon_schema.sql` | Référence structurelle complète, à jour et exécutable (reset — réservé à un sinistre, voir 5.1 et 5.3) |
| `db/migrations/` | Évolutions de schéma additives postérieures à `neon_schema.sql` |
| `db/migrate.mjs` | Script de copie Supabase → Neon utilisé lors de la migration (Phases 3 et 5, voir `docs/migration-neon.md`) — `--rollback` en sens inverse, non utilisé en fonctionnement normal |
| `supabase/recreate_full_schema.sql` | **Historique, non maintenu depuis le 11/09/2026** — équivalent Supabase de `db/neon_schema.sql` (voir 5.1), conservé pour référence/rollback jusqu'à la Phase 6 |
| `supabase/migrations/` | **Historique, non maintenu depuis le 11/09/2026** — évolutions additives appliquées du temps de Supabase |
| `supabase/fix_due_at_timezone_2026-09-04.sql` | Correction ponctuelle des données (réalignement des échéances sur Europe/Paris) — déjà appliquée (données reprises telles quelles par la migration Neon), à ne pas rejouer (voir 8.1) |

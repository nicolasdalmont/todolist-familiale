# Migration Supabase → Neon (Postgres nu) — plan d'action

Statut : **plan, rien de commencé.** Rédigé le 10/09/2026.

## 0. Contexte et motivation

L'application utilise aujourd'hui Supabase pour **une seule chose** : une base
PostgreSQL, interrogée **exclusivement côté serveur** via
`@supabase/supabase-js` (le query-builder PostgREST) avec la clé
`service_role`. Aucun client ne parle jamais à Supabase ; il n'y a ni Supabase
Auth, ni Edge Functions, ni Storage, ni RLS active (RLS activée mais **sans
aucune policy**, contournée par `service_role`).

**Pourquoi migrer :**

1. **Objectif « déployable par n'importe qui »** (voir `deployment-packaging`).
   En passant à un accès Postgres standard piloté par une seule variable
   `DATABASE_URL`, un déployeur peut brancher **n'importe quel Postgres** :
   Neon, Vercel Postgres (Neon sous le capot), Railway, un Postgres
   auto-hébergé, ou même Supabase (juste la base). Aujourd'hui il faut créer
   un projet Supabase, récupérer la clé `service_role` et comprendre PostgREST.
2. **Quotas** : le plan gratuit Supabase plafonne à 2 projets actifs ; Neon
   free en autorise ~10 (0,5 Go / projet). Utile pour multiplier les instances.
3. **Socle réutilisable** Neon + Vercel, déjà éprouvé sur d'autres projets
   (voir « Référence » ci-dessous).

**Ce chantier est distinct du packaging** : on le fait d'abord, le packaging
s'appuiera dessus.

### Référence de travail

Le projet `~/Documents/git/calyxter-set-manager` a fait cette migration en
production le 06/09/2026 (`docs/Migration_Neon.md`, `db/migrate.mjs`,
`db/neon_schema.sql`, `lib/neon.js`, scripts de rollback). Le projet
`~/Documents/git/mabedetheque` tourne aussi sur Neon. **Différence majeure**
avec Calyxter : Calyxter est une **SPA Vite** qui appelait PostgREST
*directement depuis le navigateur* → il a fallu bâtir une couche API sur
Vercel Functions (`api/db.js`) et porter 2 Edge Functions Deno.
**Checkberry n'a aucun de ces problèmes** : l'accès aux données est déjà
100 % serveur (Server Components, Server Actions, Route Handlers). La
migration se réduit à **remplacer le query-builder par du SQL**.

---

## 1. Ce qui change

| Brique | Aujourd'hui (Supabase) | Sur Neon |
| --- | --- | --- |
| Base PostgreSQL | Projet Supabase | **Projet Neon** — Postgres 16 standard, équivalent direct |
| Accès aux données | `@supabase/supabase-js` (PostgREST) côté serveur, `service_role`, dans `src/lib/*.ts` | **`@neondatabase/serverless`** (driver HTTP) + **SQL paramétré** dans les mêmes fichiers |
| Client partagé | `src/lib/supabase/admin.ts` → `createAdminClient()` | `src/lib/db.ts` → `sql` (tag template `neon()`) |
| Variables d'env | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `DATABASE_URL` (chaîne **pooled** Neon) |
| RLS / rôles | RLS activée sans policy, contournée par `service_role` | **Sans objet** : on se connecte en propriétaire de la base, qui est exempté de RLS. Les lignes `enable row level security` deviennent des no-ops (à garder en défense en profondeur, ou à retirer). |
| Auth de session | Cookie JWT signé (`jose`), scrypt (`node:crypto`) | **Inchangé** — ne touche pas la base au niveau du middleware (Edge) |
| Middleware Edge | Vérifie la signature du JWT, aucun accès base | **Inchangé** |
| Notifications push | `web-push` + table `push_subscriptions` | **Inchangé** (juste la table qui change de base) |
| Cron Vercel | `vercel.json`, `/api/cron/reminders` | **Inchangé** (juste l'accès base) |
| Déploiement, `AppUpdateWatcher`, `/api/version` | Vercel, `VERCEL_GIT_COMMIT_SHA` | **Inchangé** |

**Frontend, composants, pages, formulaires, PWA, service worker : aucun
changement.** Tout est en aval de la couche `src/lib/*.ts`, qui expose des
fonctions typées ; leur implémentation change, pas leur signature de retour.

---

## 2. Architecture de la couche d'accès aux données

### 2.1 Pas de « Data API » Neon

Neon expose une Data API compatible PostgREST, mais :

- Elle **rejette toute requête sans JWT** (`HTTP 400 missing authentication
  credentials`) — vérifié par Calyxter en Phase 0 (06/09/2026). Un accès
  « anonyme » suppose un fournisseur JWT à héberger.
- Elle est en beta.
- **Checkberry n'en a aucun besoin** : les données ne sont jamais lues depuis
  le navigateur. On se connecte en direct depuis le serveur Next, avec les
  identifiants dans `DATABASE_URL` (jamais exposée).

→ **On abandonne PostgREST entièrement et on écrit du SQL.**

### 2.2 Client : `@neondatabase/serverless`

Driver HTTP (un aller-retour HTTP par requête, rien à pooler, compatible
runtimes Node **et** Edge). `src/lib/db.ts` :

```ts
import { neon } from "@neondatabase/serverless";

// Un objet par requête ; pas de pool à gérer. `fetchOptions: { cache: "no-store" }`
// reproduit le contournement de cache déjà en place dans admin.ts (Next met
// en cache les GET fetch() des Server Components, y compris ceux du driver).
export const sql = neon(process.env.DATABASE_URL!, {
  fetchOptions: { cache: "no-store" },
});
```

Deux formes d'appel :

- **Tag template** : `` await sql`select * from tasks where id = ${id}` `` →
  `id` est paramétré ($1), jamais concaténé. Renvoie `Array<Record>`.
- **`sql.query(text, params)`** : pour le SQL construit dynamiquement (filtres
  optionnels, listes de colonnes) — `params` est un tableau de valeurs.

### 2.3 Réécriture de la couche `src/lib/*.ts`

Neuf fichiers, ~85 appels `.from(...)`. Tous **déjà** dans la couche data —
on ne touche ni les composants ni les pages (sauf pour retirer l'appel à
`createAdminClient()`).

| Fichier | Appels | Contenu |
| --- | --- | --- |
| `src/lib/queries.ts` | ~19 | Lectures. Contient les 3 requêtes imbriquées (voir 2.4). |
| `src/lib/actions.ts` | ~32 | CRUD tâches, commentaires, checklist, notifications lues |
| `src/lib/admin-actions.ts` | ~13 | CRUD membres |
| `src/lib/category-actions.ts` | ~9 | CRUD catégories |
| `src/lib/notifications.ts` | ~4 | Écriture des notifications |
| `src/lib/auth.ts` | ~3 | Recherche utilisateur, `last_login_at` |
| `src/lib/access.ts` | ~2 | `getTaskAccess` |
| `src/lib/push.ts` | ~2 | `push_subscriptions` |
| `src/lib/settings-actions.ts` | ~1 | `app_settings` |

**Signatures** : les fonctions prennent aujourd'hui `supabase` en 1er argument
(`getTasks(supabase, userId)`). On le retire : elles importent `sql` de
`src/lib/db.ts`. Chaque page passe de
`const supabase = createAdminClient(); await getTasks(supabase, id)` à
`await getTasks(id)` (une ligne par page, ~7 pages + 3 route handlers).

**Alternative** : introduire **Kysely** (query-builder typé, sans codegen
obligatoire) pour une couche data typée et des jointures propres
(`jsonArrayFrom` de `kysely/helpers/postgres` pour les ressources
imbriquées). Plus d'investissement initial (types du schéma) mais plus
maintenable. Décision à prendre en Phase 1 ; le reste du plan suppose le
**SQL brut** (moins de dépendances, diff borné aux fichiers déjà data).

### 2.4 Les 3 requêtes imbriquées (le seul point délicat)

PostgREST permet aujourd'hui d'imbriquer des ressources liées :

1. **`TASK_SELECT`** (`getTasks` / `getTask`) —
   `*, task_assignees(role, users(...)), task_tags(tags(id,name)),
   checklist_items(...), comments(count)`.
   Reshape ensuite par `mapTaskRow` en `{ ..., assignees[], tags[],
   checklist[], commentCount }`.
2. **`getComments`** — `*, author:users(...)`.
3. **`getRecentActivity`** — `..., actor:users(id,name,color)`.

Deux façons de faire en SQL :

- **Jointures + agrégation JSON** dans une seule requête :
  `jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, ...))` via des
  `LEFT JOIN LATERAL (select ...) x on true`. Une requête, propre, mais SQL
  un peu dense pour `TASK_SELECT`.
- **N+1 borné** (recommandé au vu du volume) : `select * from tasks` (déjà
  filtré par `canView` en mémoire), puis `select ... from task_assignees
  join users ... where task_id = any($1)`, idem tags / checklist / comments
  count, puis assemblage en mémoire dans `mapTaskRow`. La liste d'une
  famille = quelques dizaines de lignes → 5 requêtes courtes, imperceptible.
  `getComments` / `getRecentActivity` = une simple jointure chacune.

### 2.5 Différences de comportement à traiter

| Supabase (`@supabase/supabase-js`) | Neon (`@neondatabase/serverless`) |
| --- | --- |
| `{ data, error }` renvoyé, `error.code` (`'23505'`, `'PGRST205'`…) | L'erreur est **levée** (`throw`), `err.code` = **SQLSTATE Postgres** : `'23505'` (unique) identique, table absente = `'42P01'` (au lieu de `'PGRST205'`) |
| `.maybeSingle()` / `.single()` | `rows[0] ?? null` / vérifier `rows.length === 1` |
| `.select("*", { count: "exact", head: true })` | `select count(*)::int as n from ...` |
| `.upsert(rows, { onConflict: "name", ignoreDuplicates: true })` | `insert into ... (...) values (...) on conflict (name) do nothing` |
| `.upsert(row)` (merge sur PK) | `insert ... on conflict (id) do update set ...` |
| `.is("read_at", null)` / `.not("due_at", "is", null)` | `read_at is null` / `due_at is not null` |
| `.in("id", ids)` | `id = any($1)` (passer le tableau JS) |
| `.gte("created_at", iso)` | `created_at >= $1` |
| `.order("due_at", { ascending: true, nullsFirst: false })` | `order by due_at asc nulls last` |
| Colonne `jsonb` : objet JS accepté à l'écriture | **Piège** : le driver encode un tableau JS en littéral Postgres `{a,b}` → rejeté par `jsonb`. Sérialiser : `JSON.stringify(obj)` (ou `$1::jsonb` avec une string). Concerne **`tasks.recurrence`**. |
| Colonnes `date` renvoyées `"2026-09-13"` | Checkberry n'a **aucune** colonne `date` (tout est `timestamptz`) → piège sans objet. Les `timestamptz` restent des `Date` → `.toISOString()` comme avant. |

**Codes d'erreur à répercuter** :

- `admin-actions.ts` : `if (error.code === "23505")` → `catch (e) { if (e.code === "23505") ... }`.
- `category-actions.ts` / `settings-actions.ts` : les gardes « migration 009/010
  non appliquée » testent `PGRST205` → tester `42P01`.

### 2.6 `recreate_full_schema.sql` → `db/neon_schema.sql`

Le schéma est **quasi portable tel quel**. À produire une version `db/neon_schema.sql` :

- [ ] Ajouter `create extension if not exists pgcrypto;` en tête (par sécurité
  pour `gen_random_uuid()` — natif PG13+, donc en pratique déjà OK sur Neon).
- [ ] Retirer les 12 lignes `alter table ... enable row level security;`
  (no-ops en propriétaire) — ou les garder commentées « défense en profondeur ».
- [ ] Retirer l'en-tête de commentaires « ère Supabase » (export contexte,
  Backups Supabase, etc.).
- [ ] **Garder** : les 12 `create table`, toutes les contraintes `check (...)`
  (statuts, visibilité — pas d'`enum` de type, tout est `text + check`, portable),
  les PK/FK avec leurs `on delete cascade` / `restrict` / `set null`, les
  index de `005_activity_log.sql`, le bloc `do $$ ... drop constraint` de
  `009`, l'amorçage (compte `Admin` / `bonjour2026`, catégories, tags,
  ligne `app_settings`).
- [ ] Les fichiers `supabase/migrations/00X.sql` restent la trace de
  l'historique ; **on n'en rejoue aucun** sur Neon (tout est dans
  `neon_schema.sql`). Après bascule, les futures migrations vont dans
  `db/migrations/` (nouveau dossier, style Neon).

---

## 3. Filet de sécurité — retour rapide à Supabase

**Principe** : la version Supabase reste le point de retour permanent. On n'y
touche **jamais** (ni schéma, ni données) jusqu'à la Phase 6. `pg_dump` /
lecture seule uniquement.

### 3.1 Ce qui reste intact

- **Le projet Supabase** : base, données, clé `service_role`. Aucune écriture.
- **Le code Supabase** : sur `main`, tag `pre-neon-migration` posé avant la
  bascule. La réécriture se fait sur la branche `migration-neon`.
- **Les déploiements Vercel antérieurs** : tous conservés, re-promouvables sans
  rebuild.

### 3.2 Pas de flag `BACKEND` dans le code

Calyxter gardait `const BACKEND = 'supabase' | 'neon'` car son code Supabase
vivait dans le frontend (SPA) et devait continuer à tourner. **Checkberry
n'a pas ce besoin** : l'accès data est 100 % serveur, la réécriture est
tout-ou-rien, et la coexistence se fait par **branche + Preview Vercel**
(prod sur `main`/Supabase, branche `migration-neon` déployée en Preview
pointant sur Neon). Le repli, c'est l'**Instant Rollback Vercel**.

*(Si on tient à un flip sans redéploiement, on peut garder les deux clients
derrière une variable `DATA_BACKEND` — mais ça double le code data pendant
toute la fenêtre. Non recommandé ici.)*

### 3.3 Trois niveaux de retour arrière

| Niveau | Quand | Comment | Délai | Perte |
| --- | --- | --- | --- | --- |
| **1 — Instant Rollback Vercel** | Le front Neon est cassé | Vercel → « Promote to Production » sur le dernier déploiement ère Supabase. Aucun rebuild. | ~30 s | Écritures faites sur Neon depuis la bascule |
| **2 — Revert Git** | Problème dans le code mergé | `git revert` du merge → redéploiement auto | ~5 min | Idem |
| **3 — Retour des données** | Neon a tourné, on ne veut pas perdre ses écritures | `node db/migrate.mjs --rollback` (Neon → Supabase), puis niveau 1/2 | ~15 min | Nulle (si répété à blanc) |

La version Supabase n'étant jamais modifiée, **le niveau 1 seul suffit** à
retrouver une app fonctionnelle immédiatement.

### 3.4 Réduire la fenêtre de perte à zéro

- Bascule (Phase 5) pendant un **vrai créneau creux**, écritures gelées
  (annonce dans le groupe familial + bannière maintenance optionnelle).
  Aucune écriture entre le dernier dump et la bascule → rollback niveau 1 sans
  aucune perte.

### 3.5 Critères go / no-go

Fixés **avant** la bascule. Rollback immédiat si : un membre ne peut pas se
connecter avec son mot de passe existant · une écriture échoue silencieusement
· latence perçue > 3 s de façon répétée · toute perte de donnée constatée.
Fenêtre d'observation : **48 h** rollback niveau 1 armé, puis **2 semaines**
avant de supprimer quoi que ce soit côté Supabase.

---

## 4. Phase 0 — Pilote (lever les inconnues)

Sur un **projet Neon jetable**, données bidon. Ne touche pas la prod.

**Côté dashboards (toi) :**

1. [ ] Créer un compte Neon + un **projet pilote** (région `aws eu-central-1`
   / Frankfurt). Noter la chaîne **pooled** (runtime) et la chaîne **directe**
   (`pg_dump` / scripts).
2. [ ] SQL Editor → coller/exécuter une première version de `db/neon_schema.sql`.

**Tests à faire (Claude prépare les scripts) :**

- [ ] **Connexion + latence** : Route Handler `/api/ping-neon` → `select now()`
  via `@neondatabase/serverless`. Mesurer le cold start (autosuspend Neon) —
  attendu ~300-800 ms sur la 1re requête après inactivité, puis < 50 ms.
  Décider si l'autosuspend est acceptable (il l'est presque sûrement pour un
  usage familial) ou à désactiver (coûte des CU-h).
- [ ] **scrypt inter-op** : script Node qui prend un `password_hash` **produit
  par l'appli actuelle** (format `sel_hex:cle_hex`, scrypt N=… via
  `node:crypto`) et vérifie qu'un mot de passe connu valide bien contre ce
  hash **après un aller-retour Supabase → Neon**. (En pratique : la colonne
  est copiée verbatim, `verifyPassword` est du pur `node:crypto`, aucune
  raison que ça casse — mais on le prouve.)
- [ ] **Une requête imbriquée** : réécrire `getTask` (la plus complexe) en SQL
  contre le pilote, comparer le JSON produit à celui de la version Supabase
  sur la même tâche (mêmes `assignees` / `tags` / `checklist` /
  `commentCount`).
- [ ] **jsonb** : insérer une tâche avec `recurrence = {"type":"weekly",...}`
  via le driver, relire, vérifier l'objet.
- [ ] **Cache Next** : sur une page `force-dynamic`, faire deux lectures
  successives encadrant une écriture concurrente (script) → la 2e doit voir
  la nouvelle valeur (valide le `fetchOptions: { cache: "no-store" }`).

**Livrable Phase 0** : go/no-go sur l'approche « SQL brut + `@neondatabase/serverless` ».
Aucune raison identifiée de ne pas y aller (contrairement à Calyxter, pas de
Data API dans la boucle).

---

## 5. Phase 1 — Préparation (sans impact prod)

Branche `migration-neon`. `main` reste sur Supabase.

- [ ] `npm i @neondatabase/serverless` ; `npm i -D pg` (scripts de migration
  uniquement).
- [ ] `src/lib/db.ts` (voir 2.2).
- [ ] `db/neon_schema.sql` finalisé (voir 2.6). Le versionner.
- [ ] `db/migrate.mjs` — adapté de Calyxter : Node + `pg`, copie table par
  table dans l'ordre des FK, `truncate ... restart identity cascade` sur la
  cible, `JSON.stringify` des objets pour les colonnes `jsonb`, comparaison
  des `count(*)` des 12 tables, `--rollback` (Neon → Supabase) avec
  confirmation `ROLLBACK` tapée. Tables :
  `users, tasks, task_assignees, comments, categories, app_settings, tags,
  task_tags, checklist_items, activity_log, notifications, push_subscriptions`.
  Ordre d'insertion : `users, categories, app_settings, tags` →
  `tasks` → `task_assignees, task_tags, checklist_items, comments,
  activity_log, notifications, push_subscriptions`.
- [ ] `.env.example` : remplacer `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
  par `DATABASE_URL` (+ note « chaîne pooled Neon »).
- [ ] Décider : SQL brut ou Kysely (voir 2.3).
- [ ] Projet Neon **définitif** (distinct du pilote), `neon_schema.sql`
  exécuté, `DATABASE_URL` défini dans Vercel pour **Preview** (pas encore
  Production).

---

## 6. Phase 2 — Réécriture de la couche data (le gros du travail)

Sur `migration-neon`. Fichier par fichier, dans cet ordre (du plus autonome
au plus dépendant) :

1. [ ] **`src/lib/db.ts`** (fait en Phase 1).
2. [ ] **`src/lib/auth.ts`** — `getUserWithPasswordHash`, `getCurrentUser`,
   `recordLogin` / `touchLastSeen`. Simples `select` / `update`.
3. [ ] **`src/lib/access.ts`** — `getTaskAccess` (une requête `tasks` + une
   `task_assignees`, ou une jointure).
4. [ ] **`src/lib/push.ts`** — `push_subscriptions` : `insert on conflict
   (endpoint) do update`, `delete where endpoint = ...`, purge sur 404/410.
5. [ ] **`src/lib/notifications.ts`** — `notifyUser` / `notifyTaskParticipants`
   (`insert`), `actorName` (`select`).
6. [ ] **`src/lib/queries.ts`** — le plus gros. Les 3 requêtes imbriquées
   (voir 2.4). `getTasks`, `getTask`, `getComments`, `getRecentActivity`,
   `getMyNotifications`, `getBadgeCount`, `getProfiles`, `getProfile`,
   `getMembers`, `getUserStats`, `getCategories`, `getAppSettings`, `getTags`,
   `upsertTagIds`.
7. [ ] **`src/lib/actions.ts`** — CRUD tâches (`createTaskAction`,
   `updateTaskAction`, `deleteTaskAction`, `setStatusAction`), commentaires,
   checklist, `markNotification(s)ReadAction`, `resolveCategorySlug`,
   `syncTaskTags`, `logActivity`. Beaucoup d'appels mais tous simples
   (`insert` / `update` / `delete` avec `where`).
8. [ ] **`src/lib/admin-actions.ts`** — CRUD membres. Gérer `err.code === "23505"`.
9. [ ] **`src/lib/category-actions.ts`** — CRUD catégories. Garde « table
   absente » → `42P01`.
10. [ ] **`src/lib/settings-actions.ts`** — `update app_settings`.
11. [ ] **Pages & route handlers** : retirer `createAdminClient()` et le
    passage de `supabase` aux fonctions data. `src/app/page.tsx`,
    `tasks/page.tsx`, `tasks/new/page.tsx`, `tasks/[id]/page.tsx`,
    `tasks/[id]/edit/page.tsx`, `admin/page.tsx`, `login/page.tsx`,
    `compte/page.tsx` ; `api/cron/reminders/route.ts`,
    `api/tasks/[id]/calendar/route.ts`, `api/push/subscribe/route.ts`.
12. [ ] **Supprimer** `src/lib/supabase/admin.ts` et la dépendance
    `@supabase/supabase-js` (en Phase 6 seulement si on garde un flag ;
    sinon dès maintenant sur la branche).
13. [ ] `npx tsc --noEmit` + `npm run build` verts.
14. [ ] Filet : garder le fil de commentaires trié DESC, la fenêtre 48 h de
    `getRecentActivity`, la tolérance « table absente » de `getCategories` /
    `getAppSettings` (utile aussi sur Neon si `neon_schema.sql` incomplet).

**Contrôle de non-régression** : pour chaque fonction data, comparer le
résultat Supabase vs Neon sur les mêmes données (script de diff, ou recette
manuelle en Phase 4).

---

## 7. Phase 3 — Migration des données (répétition à blanc)

Supabase et Neon sont du Postgres standard.

- [ ] Chaînes **directes** des deux côtés (Supabase : Project Settings →
  Database → URI, **pas** le pooler ; Neon : Connection Details, pooling
  désactivé). À passer en `export` dans le terminal, **jamais** dans le chat
  ni un fichier committé.
- [ ] `node db/migrate.mjs` (Supabase → projet Neon **de test**).
- [ ] Vérifier les `count(*)` des 12 tables (le script le fait).
- [ ] Contrôles ponctuels :
  - [ ] `users` : les 4 profils, `password_hash` **non nul et identique** à la
    source (⇒ mots de passe existants toujours valides).
  - [ ] `tasks` : nombre correct, `recurrence` (jsonb) bien transféré sur
    2-3 lignes, `due_at` cohérents.
  - [ ] `task_assignees` : rôles `editor`/`viewer` préservés.
  - [ ] `categories` / `app_settings` : présents (sinon `neon_schema.sql` les
    a semés — vérifier qu'il n'y a pas de doublon).
  - [ ] `push_subscriptions` : endpoints + clés `p256dh`/`auth` intacts.
  - [ ] `activity_log`, `notifications` : `read_at` / `actor_id` cohérents.
- [ ] Pas de séquences à resynchroniser (tous les `id` en `uuid default
  gen_random_uuid()`).

---

## 8. Phase 4 — Recette fonctionnelle (Preview Vercel sur Neon de test)

Brancher le Preview sur le projet Neon **de test** (copie des données via
Phase 3). Parcours à valider avec 1-2 membres réels :

- [ ] **Connexion** : choix de profil, **connexion avec un mot de passe
  existant** (validation cruciale du `password_hash`), première connexion
  (mot de passe temporaire → définitif), changement de mot de passe connecté.
- [ ] **Accueil** : compteurs (en retard / aujourd'hui / semaine), salutation,
  fil « À ton attention », « Activité du jour », « Partagées avec toi »,
  invite notifications, pastille App Badge.
- [ ] **Tâches** : liste, recherche, tous les filtres (statuts, catégorie,
  intervalle d'échéance, visibilité, en retard, lecture seule, tags), résumé
  de filtre, bandeau « Filtré depuis l'accueil », mémorisation session.
- [ ] **Tâche** : création (partage par personne + rôle, tags à la volée,
  catégorie, récurrence, raccourcis d'échéance), détail, changement de
  statut (+ régénération d'occurrence récurrente), checklist (coche optimiste,
  suppression annulable), commentaires (ajout, suppression annulable,
  modération créateur), export `.ics`, modification, suppression (confirmation).
- [ ] **Admin** : onglet Membres (créer avec mot de passe temporaire,
  renommer, changer de rôle, réinitialiser, supprimer + cascade), onglet
  Catégories (créer, renommer, icône, réordonner, supprimer + réaffectation),
  onglet Réglages (interrupteur rappel), onglet Activité (stats).
- [ ] **Notifications** : partage d'une tâche → notif + push reçus par le
  destinataire ; commentaire → notif ; suppression → notif sans lien ;
  dédoublonnage avec « Activité ». Opt-in depuis « Mon compte », push réel
  sur un appareil.
- [ ] **Rappel d'échéance** : déclencher `/api/cron/reminders` à la main
  (avec `CRON_SECRET`), vérifier l'envoi et le garde-fou anti-doublon.
- [ ] **Session périmée** : supprimer un membre connecté → il retombe sur
  `/login` sans boucle (`/api/session/end`).
- [ ] **PWA** : install, `manifest.webmanifest`, tirer pour rafraîchir,
  barre d'onglets, zones sûres iOS.
- [ ] **Rafraîchissement auto** (`/api/version`) : inchangé, revérifier.
- [ ] **Latence** : acceptable même avec cold start Neon.
- [ ] **Répéter à blanc le rollback données** : `node db/migrate.mjs
  --rollback` (Neon de test → projet Supabase **jetable**), vérifier les
  volumes. *Un rollback jamais testé n'est pas un rollback.*

---

## 9. Phase 5 — Bascule en production

- [ ] `git tag pre-neon-migration <sha>` sur le dernier commit « ère
  Supabase » de `main` ; noter l'ID du déploiement Vercel de prod actuel.
- [ ] Fixer les critères go/no-go (§ 3.5).
- [ ] Annoncer dans le groupe : « appli indisponible ~20 min le [créneau
  creux] ». Choisir un moment sans usage.
- [ ] Geler les écritures (prévenir ; bannière maintenance optionnelle).
- [ ] **Rejouer la Phase 3** vers le projet Neon **de production**, données
  les plus fraîches. Vérifs de volumes + contrôles ponctuels.
- [ ] Vérifier `DATABASE_URL` en **Production** sur Vercel (pas seulement
  Preview). Retirer `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` **plus tard**
  (Phase 6) — les laisser ne gêne pas.
- [ ] Merger `migration-neon` → `main` → déploiement Vercel auto.
- [ ] **Test de fumée immédiat** : connexion d'un membre, une lecture, une
  écriture (créer puis supprimer une tâche de test), une notif, vérifier
  qu'aucune requête ne part vers `supabase.co` (onglet réseau).
- [ ] Retirer la bannière, annoncer « c'est reparti ».
- [ ] **Observation 48 h**, rollback niveau 1 armé. Surveiller les logs Vercel
  Functions et les métriques Neon.

---

## 10. Phase 6 — Nettoyage (après ~2 semaines sans incident)

- [ ] Supprimer / mettre en pause le projet Supabase (libère un slot gratuit).
- [ ] Retirer du dépôt : `src/lib/supabase/`, la dépendance
  `@supabase/supabase-js`, `db/migrate.mjs --rollback` (si le retour arrière
  est jugé définitivement clos), la dépendance `pg`.
- [ ] `supabase/` → renommer en `db/` (schéma + historique migrations), ou
  garder `supabase/migrations/` en archive et démarrer `db/migrations/` pour
  la suite.
- [ ] Doc technique : §3 (architecture), §5 (modèle de données), §8.2 (pièges
  de cache — le contournement `admin.ts` devient `db.ts`), inventaire §11,
  en-tête, README, `.env.example`. Retirer les mentions « service_role »,
  « PostgREST », « RLS ».
- [ ] Mémoire projet + changelog.
- [ ] **Documenter le socle « Neon (ou tout Postgres) + Vercel » comme base
  du packaging** (étape suivante).

---

## 11. Risques et mitigations

| Risque | Impact | Mitigation |
| --- | --- | --- |
| Régression dans la réécriture SQL (~85 requêtes) | Bugs fonctionnels | Surface concentrée dans 9 fichiers data déjà isolés ; recette § 8 exhaustive ; Preview avant prod ; comparaison Supabase/Neon fonction par fonction |
| Requête imbriquée (`TASK_SELECT`) mal traduite | Tâches affichées sans assignés / tags / checklist | Réécrite et comparée dès la Phase 0 ; approche N+1 borné plus simple à vérifier |
| `jsonb` (`recurrence`) mal sérialisé | Récurrence corrompue | `JSON.stringify` systématique à l'écriture (même règle que `db/migrate.mjs`) ; contrôle ponctuel § 7 |
| Hash de mot de passe cassé après migration | Les 4 membres bloqués | Colonne copiée verbatim ; `verifyPassword` est du pur `node:crypto` ; test inter-op en Phase 0 ; contrôle § 7 |
| Cold start Neon (autosuspend) | 1re requête ~500 ms après inactivité | Acceptable pour l'usage ; mesuré en Phase 0 ; autosuspend désactivable si besoin |
| Cache Next re-mord malgré le driver | Lecture périmée | `fetchOptions: { cache: "no-store" }` sur `neon()` + `force-dynamic` conservés ; testé Phase 0 |
| Codes d'erreur différents (`PGRST205` → `42P01`, `{data,error}` → `throw`) | Gardes qui ne se déclenchent plus | Recensés au § 2.5 ; passer les accès en `try/catch` |
| Perte d'écritures pendant la fenêtre de bascule | Quelques données récentes | Fenêtre courte + créneau creux + gel des écritures (§ 3.4) ; `migrate.mjs --rollback` préparé et répété (§ 8) |
| Blocage après bascule prod | Appli indisponible | Filet § 3 : Instant Rollback ~30 s, Supabase jamais modifié, observation 48 h armée |
| Rollback jamais testé | Le filet ne fonctionne pas le jour J | Répétition à blanc en Phase 4 ; Instant Rollback vérifiable à tout moment sur Vercel |
| Quota Neon free | Base bloquée | 0,5 Go / projet, 100 CU-h / mois — la base fait quelques Mo, large marge |

---

## 12. Estimation d'effort (dev solo, à étaler)

| Phase | Effort |
| --- | --- |
| 0 — Pilote (compte Neon, scripts de test, 1 requête imbriquée) | 0,5-1 j |
| 1 — Préparation (`db.ts`, `neon_schema.sql`, `migrate.mjs`, projet Neon) | 0,5-1 j |
| 2 — Réécriture des 9 fichiers data + pages | **2-3 j** (le cœur) |
| 3 — Migration des données (script + répétition) | 0,5 j |
| 4 — Recette + répétition rollback | 0,5-1 j |
| 5 — Bascule prod (dont fenêtre ~20 min) | 0,5 j |
| 6 — Nettoyage + doc | 0,5 j |
| **Total** | **~5-7 j** |

Seule la Phase 5 implique une courte indisponibilité.

---

## 13. Ordre d'exécution résumé

1. **Phase 0** sur un pilote jetable → confirmer l'approche (aucun blocage
   attendu, pas de Data API dans la boucle).
2. **Phases 1-2** sur la branche `migration-neon` + un projet Neon de test.
   `main` reste sur Supabase.
3. **Phase 3** (migration données) répétée à blanc vers le Neon de test.
4. **Phase 4** (recette + répétition rollback) sur un Preview Vercel.
5. **Phase 5** (bascule prod) sur un créneau annoncé, tag `pre-neon-migration`
   posé, Instant Rollback armé.
6. Observation 48 h puis 2 semaines, Supabase gardé en secours.
7. **Phase 6** (nettoyage + doc) une fois la bascule acquise → base du packaging.

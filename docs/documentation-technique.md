# To-Do List Familiale — Documentation technique

Dernière mise à jour : 04/09/2026 (compteur "En retard" et journal
d'activité / fil "Activité du jour" sur l'écran d'accueil, disposition
compacte des tuiles "Aujourd'hui"/"Cette semaine", rationalisation des
filtres de la liste des tâches, ajustement du filtre de statut (4 boutons
à cocher plutôt qu'un bouton à bascule), volet dépliable "Filtres" replié
par défaut et adaptation mobile des filtres, puis script de reconstruction
intégrale de la base — voir 5.3, 6.6 et 6.7).
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
d'accueil résume les tâches à traiter en priorité.

## 2. Pile technique

| Couche | Choix | Rôle |
|---|---|---|
| Framework | Next.js 14.2.35 (App Router, TypeScript) | Rendu serveur, routage, Server Actions |
| UI | React 18.3.1, Tailwind CSS 3.4 | Composants, style |
| Base de données | Supabase (Postgres géré) | Stockage — **pas** Supabase Auth |
| Authentification | Maison (`src/lib/auth.ts`) | Table `users`, hash scrypt, cookie JWT (`jose`) |
| Hébergement | Vercel | Build + déploiement continu |
| PWA | `manifest.json` + `public/sw.js` | Installabilité, cache de l'app shell |

Aucune dépendance d'UI framework (pas de librairie de composants) ni d'ORM :
les requêtes passent directement par le client `@supabase/supabase-js`.

## 3. Architecture générale

```
Navigateur ── HTTPS ──> Vercel (Next.js, App Router)
                          ├─ Middleware Edge : vérifie le cookie JWT
                          ├─ Server Components : lisent Supabase (clé service_role)
                          │    et filtrent l'accès via src/lib/access.ts
                          └─ Server Actions ("use server") : écrivent dans Supabase
                                          │    après vérification d'accès (access.ts)
                                          ▼
                                 Supabase Postgres
                                 (RLS activé, SANS policy)
```

Points clés :

- **Supabase n'est qu'une base Postgres hébergée.** Il n'y a pas de compte
  Supabase Auth, pas d'appel au SDK Supabase depuis le navigateur, et
  aucune clé Supabase n'est exposée côté client. Toutes les lectures et
  écritures passent par un unique client "admin" (`src/lib/supabase/admin.ts`),
  instancié avec la clé **service_role**, qui contourne Row Level
  Security par conception.
- **RLS est activé sur toutes les tables mais sans aucune policy** :
  ceinture-bretelles en cas de fuite de la clé publique `anon` (qui, elle,
  n'a jamais accès à rien). La sécurité applicative (qui peut voir/modifier
  quoi) est donc entièrement gérée dans le code Next.js, centralisée dans
  `src/lib/access.ts` (voir section 6.1) — RLS ne joue aucun rôle dans le
  contrôle d'accès aux tâches privées ou partagées.
- **Aucune API REST/GraphQL exposée** : tout passe par des Server
  Components (lecture, au chargement de page) et des Server Actions
  (écriture, déclenchées par des formulaires ou des boutons). Il n'y a pas
  de route `/api/*` applicative — seule exception, `/api/version` (voir
  6.8), qui n'expose aucune donnée métier.

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
  la signature du JWT (aucun appel réseau à Supabase) ; redirige vers
  `/login` si absent/invalide, et redirige un utilisateur déjà connecté
  qui visite `/login` vers `/`.
- **Parcours de connexion** (`LoginForm.tsx`) : grille des profils
  (prénom + avatar) → mot de passe. Si `password_set = false` (première
  connexion), le même écran demande le mot de passe temporaire puis fait
  saisir immédiatement un mot de passe personnel (`setPasswordAction`).
- **Changer son mot de passe** : depuis l'écran de connexion (lien
  "Changer mon mot de passe", `setPasswordAction`) ou, une fois connecté,
  depuis l'écran "Mon compte" (`/compte`, `changePasswordAction` — voir
  6.14). Les deux vérifient le mot de passe actuel ; la version connectée
  ne rouvre pas de session (le cookie JWT ne dépend pas du hash).
- **Création de compte** : pas d'interface dédiée — se fait en SQL direct
  dans Supabase (voir README, section "Authentification"). Claude peut
  précalculer le hash scrypt d'un mot de passe temporaire sur demande.
- **Mot de passe oublié** : l'administrateur redéfinit `password_hash` en
  base et repasse `password_set` à `false` ; l'utilisateur retombe sur le
  flux de première connexion.

Ce module gère uniquement *qui est connecté* ; il ne dit rien de *ce que
cette personne a le droit de voir ou modifier une fois connectée* — c'est
le rôle de `src/lib/access.ts`, voir section 6.1.

## 5. Modèle de données

### 5.1 Où trouver le schéma de référence

Deux sources complémentaires, toutes deux dans `supabase/` :

1. **`supabase/recreate_full_schema.sql`** — la structure **complète et à
   jour**, exécutable telle quelle (voir 5.3). C'est la référence à
   consulter pour connaître l'état actuel des tables (colonnes, valeurs
   par défaut, contraintes `check`, clés étrangères et leurs clauses
   `on delete`). C'est un **script de reset** (`drop table ... cascade`
   puis `create table`) : il ne doit jamais être rejoué sur la base de
   production en fonctionnement normal, il la détruirait — voir 5.3.
2. **`supabase/migrations/`** — l'historique des évolutions **réellement
   appliquées** sur la base de production, en scripts additifs numérotés
   (aucun `drop`, uniquement `add column if not exists` /
   `create table if not exists`) :
   - `001_categories_and_tags.sql` — colonne `category` sur `tasks` +
     tables `tags`/`task_tags`.
   - `002_sharing_roles.sql` — colonne `role` sur `task_assignees` +
     recalcul de `visibility` pour toutes les tâches existantes (voir 6.1).
   - `003_last_login.sql` — colonne `users.last_login_at` (voir 6.9).
   - `004_checklist.sql` — table `checklist_items` (voir 6.10).
   - `005_activity_log.sql` — table `activity_log` (voir 6.12).

Toute nouvelle évolution du schéma passe par un nouveau fichier numéroté
dans `supabase/migrations/` (voir section 10), et `recreate_full_schema.sql`
est mis à jour en parallèle pour rester le reflet fidèle de la structure.

**Le contenu (les lignes) n'est pas versionné ici** : `recreate_full_schema.sql`
ne sème qu'un compte `Admin` de secours (mot de passe temporaire
`bonjour2026`) et neuf tags de départ. En production, `Admin` a été
renommé `Nicolas`, les autres membres de la famille ont été ajoutés
manuellement en SQL, et la liste des tags s'est enrichie depuis le
formulaire de tâche.

> Historique : jusqu'au 04/09/2026, la référence structurelle était
> `supabase/schema.sql`, un script de reset qui n'avait pas été maintenu
> en parallèle des migrations `003`/`004`/`005` (il ne contenait ni
> `checklist_items` ni `activity_log`). Il a été supprimé le 04/09/2026 au
> profit de `recreate_full_schema.sql`, complet et vérifié (voir 5.3).

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
| `category` | text | 7 valeurs fixes — voir 6.2 |
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

Toutes les tables ont `row level security` activé et **aucune policy** —
voir section 3.

### 5.3 Script de reconstruction intégrale (`supabase/recreate_full_schema.sql`, 04/09/2026)

Ce script est **complet et exécutable tel quel** : il recrée les 8 tables
actuelles (`users`, `tasks`, `task_assignees`, `comments`, `tags`,
`task_tags`, `checklist_items`, `activity_log`), les deux index de
`activity_log`, active RLS partout sans policy, et sème un compte
administrateur de secours (`Admin`, mot de passe temporaire `bonjour2026`)
plus les 9 tags de départ. **À n'utiliser qu'en cas de sinistre** (base
perdue/corrompue, nouvel environnement de secours) : c'est un reset complet
(`drop table ... cascade`) qui ne doit jamais être rejoué sur la base de
production en fonctionnement normal, et il **ne restaure aucune donnée**
(comptes de la famille, tâches, commentaires) — seulement la structure,
vide. Une vraie restauration de données perdues passe par les sauvegardes
Supabase (Database → Backups) ou un export `pg_dump` antérieur, pas par ce
script.

Généré à partir d'un export du schéma réel de production (fonction
d'export "contexte" de Supabase, explicitement marqué "for context only,
not meant to be run" par Supabase lui-même). Deux écarts volontaires par
rapport à cet export, documentés en tête du script :

1. **Clauses `on delete` restaurées.** L'export "contexte" de Supabase les
   omet systématiquement (simplification de cet export, pas un reflet de
   la structure réelle) ; le script les rétablit à partir des migrations
   qui les ont introduites — `on delete cascade` pour
   `task_assignees`/`comments`/`task_tags`/`checklist_items` et
   `activity_log.task_id`, `on delete set null` pour
   `activity_log.actor_id` (comportement documenté en 5.2 et 6.12).
   **Vérifié par exécution réelle** (PostgreSQL 16 local, hors Supabase) :
   supprimer une tâche supprime bien en cascade ses assignations,
   commentaires, items de checklist et lignes d'activité ; supprimer
   l'auteur d'une ligne d'activité met bien `actor_id` à `null` sans
   supprimer la ligne ni bloquer la suppression du compte ; supprimer un
   utilisateur encore créateur d'une tâche est bien refusé par la base
   (`tasks.created_by` n'a pas de `on delete`, comme dans l'export).
2. **Deux valeurs par défaut prises directement de l'export** (état réel
   de la base de production) : `users.color` par défaut `#6C5CE7` et
   `tasks.visibility` par défaut `shared` (sans
   conséquence pratique, ce champ étant toujours recalculé par
   l'application avant écriture, jamais laissé à sa valeur par défaut).

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
- `getTaskAccess(supabase, taskId, userId)` — version asynchrone qui
  requête directement la base, utilisée dans les Server Actions qui n'ont
  pas déjà la tâche en mémoire (modification, suppression, changement de
  statut, commentaire, checklist). Renvoie aussi `title` et `visibility`
  de la tâche (ajouté avec le journal d'activité — voir 6.12) : évite une
  requête séparée aux appelants qui ont besoin de ces deux champs pour
  journaliser une activité.

Ce module est appliqué systématiquement :

- **En lecture** : `getTasks(supabase, userId)` et `getTask(supabase, id,
  userId)` (`src/lib/queries.ts`) ne renvoient que ce que `canView`
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

Chaque tâche a une catégorie principale à choix unique, valeur fixe
(contrainte `check` en base) : `achats`, `autre`, `cadeaux`, `enfants`,
`famille`, `maison`, `vacances` — triées par ordre alphabétique dans
l'interface. Libellés et icônes associées centralisés dans
`src/lib/categories.ts`. Affichée sur la carte de tâche et l'écran de
détail.

### 6.3 Échéance et récurrence

**Échéance** (`tasks.due_at`, `timestamptz` nullable) : optionnelle. Le
formulaire de tâche (`TaskForm.tsx`) affiche un `<input datetime-local>`
contrôlé, avec un lien **« Retirer l'échéance »** qui le vide — la saisie
vide est traduite en `due_at = null` par les Server Actions
(`dueAtRaw ? … : null`). Saisie et affichage sont en heure de Paris (voir
8.1).

**Récurrence** stockée en JSON dans `tasks.recurrence` : `{ type: "none" | "daily" |
"weekly" | "monthly" | "custom", interval?, unit?: "days"|"weeks"|"months" }`.
Quand une tâche récurrente passe à `done`
(`setStatusAction` dans `src/lib/actions.ts`, après vérification
`canEdit` — voir 6.1), la prochaine occurrence est calculée
(`computeNextOccurrence` dans `src/lib/format.ts`) à partir de l'échéance
actuelle, puis une nouvelle tâche `todo` est créée avec le même titre, la
même description, la même catégorie, les mêmes tags, la même checklist
(décochée — voir 6.10) et **les mêmes partages (personne + rôle)**, pour
que la confidentialité d'une tâche récurrente reste cohérente d'une
occurrence à l'autre. Si la tâche récurrente n'a pas d'échéance, aucune
occurrence n'est régénérée (rien à incrémenter). Les commentaires, eux,
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

La **carte de tâche** (`TaskCard.tsx`, liste `/tasks`) affiche une icône
bulle + le nombre de commentaires quand il est > 0. Le compte vient de
l'agrégat PostgREST `comments(count)` ajouté à `TASK_SELECT`
(`src/lib/queries.ts`, exposé en `Task.commentCount`) — pas de requête
supplémentaire.

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

Message de bienvenue ("Bonjour, {Prénom}" + date du jour), trois tuiles
cliquables (`HomeDashboard.tsx`) et, en dessous, un fil "Activité du jour"
(`ActivityFeed.tsx`) — voir 6.12. Les compteurs sont calculés **côté
client** (voir 8.1 sur la raison de ce choix) à partir de la liste de
tâches déjà filtrée par `getTasks` (donc uniquement les tâches visibles
par l'utilisateur connecté — voir 6.1) :

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
`/tasks?dueAtMost=YYYY-MM-DD` (voir 6.7) : le nombre affiché sur la tuile
(échéance strictement dans la période) peut donc différer du nombre de
tâches affichées après le clic, qui inclut en plus tout ce qui est déjà
en retard — comportement voulu. La tuile "En retard" est un lien vers
`/tasks?overdue=1`, qui active le nouveau filtre "En retard uniquement"
de `TaskFilterList.tsx` (voir 6.7) — celui-ci n'a pas cette différence
cumulative : il ne montre que les tâches réellement en retard.

### 6.7 Liste des tâches, recherche et filtres (`/tasks`)

**Filtrage entièrement côté client, sans onglet ni paramètre `?filter=`
côté serveur.** `src/app/tasks/page.tsx` se contente de charger
`getTasks(supabase, profile.id)` (déjà filtré par `canView` — voir 6.1) et
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

Une fois déplié, chaque ligne peut regrouper deux filtres séparés par une
**barre verticale** sur desktop (`FilterSeparator`, ajoutée le 03/09/2026 ;
**masquée en dessous du point de rupture Tailwind `sm`**, ajout du
04/09/2026 à la demande explicite de l'utilisateur — sur mobile, chaque
groupe de filtres d'une ligne passe à la ligne suivante, l'un sous
l'autre, plutôt que de rester côte à côte séparé par une barre qui
n'aurait plus de sens dans cette disposition empilée) :

1. **Portée │ statut** :
   - **Portée** : par défaut **mes tâches** uniquement
     (`task.created_by === currentUserId`, prop `currentUserId` transmis
     par `tasks/page.tsx`) ; le bouton "Toutes les tâches" bascule vers
     tout ce qui est visible par l'utilisateur (y compris partagé avec
     lui), et inversement.
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
   - **Échéance** : `<input type="date">` "au plus tard le", avec un
     bouton "Effacer" quand une date est choisie — ne garde que les
     tâches ayant une échéance renseignée et inférieure ou égale à la
     date choisie (donc y compris les tâches déjà en retard). Peut être
     pré-rempli via `?dueAtMost=` (utilisé par les tuiles
     "Aujourd'hui"/"Cette semaine" de l'accueil, voir 6.6).
3. **Partagé/Privé │ en retard uniquement** (inchangé depuis son ajout) :
   - Partagé/Privé : trois boutons (Toutes / Partagées / Privées), filtre
     sur le champ dérivé `visibility` (voir 6.1).
   - En retard uniquement : bouton à bascule, même définition que la
     tuile "En retard" de l'accueil (`isOverdue()`) — voir 6.6. Pré-activé
     via `?overdue=1`, utilisé par cette tuile.
4. **Tags** — sélection multiple, logique OR (une tâche matche si elle a
   au moins un des tags cochés), inchangé. Pas de séparateur sur cette
   ligne, qui ne porte qu'un seul groupe de filtres.

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

### 6.9 Statistiques admin (`/admin`)

Écran réservé au compte de rôle `admin` (lien "Admin" masqué pour les
autres dans `Topbar.tsx` ; page elle-même protégée côté serveur par un
`notFound()` sinon, même logique que les autres pages restreintes de
l'appli — voir 6.1). Affiche, pour chaque membre de la famille : sa
dernière activité (`users.last_login_at`, migration
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

Exemples de messages générés : "Anne-Françoise a partagé 1 nouvelle tâche
avec vous : Réserver le gîte", "Virgile a coché un élément de la checklist
de la tâche Courses de la semaine", "Nicolas a changé le statut de la
tâche Impôts en « Terminée »". Si le fil est vide pour la journée, un
message neutre ("Aucune activité partagée aujourd'hui.") s'affiche à la
place plutôt que de faire disparaître la section.

### 6.13 Ajouter une tâche à Google Agenda (04/09/2026)

L'écran de détail d'une tâche **datée** affiche, à côté de l'icône crayon
« Modifier », une icône calendrier qui ouvre le formulaire de création
d'événement de Google Agenda **pré-rempli** (titre, créneau, description) —
l'utilisateur choisit son agenda et enregistre.

- **Aucune API, aucun OAuth, aucun secret.** `googleCalendarUrl()`
  (`src/lib/calendar.ts`) construit une simple URL
  `https://calendar.google.com/calendar/render?action=TEMPLATE&…`. Sur
  mobile, le lien ouvre l'application Google Agenda ; sur desktop, l'onglet
  web.
- **Créneau** : un bloc d'**une heure** à partir de l'échéance. L'échéance
  est transmise en UTC (suffixe `Z`) ; Google la reconvertit dans le fuseau
  de l'agenda de l'utilisateur. Depuis la refonte fuseau du 04/09/2026
  (§8.1), l'instant stocké est correct, donc l'événement tombe à la bonne
  heure de Paris.
- **Description de l'événement** : la description de la tâche, suivie de
  l'URL absolue de la tâche (reconstruite depuis les en-têtes `host` /
  `x-forwarded-proto` de la requête) pour pouvoir y revenir.
- **Tâche sans échéance** : l'icône n'est pas affichée (rien à planifier).
- **Accessible à tous ceux qui voient la tâche** (y compris en lecture
  seule) : c'est leur propre agenda, aucune écriture côté appli.
- **Copie ponctuelle** : une modification ultérieure de la tâche (titre,
  échéance) ne met pas l'événement à jour. La récurrence de la tâche n'est
  pas transmise pour l'instant (évolution possible via le paramètre
  `recur=RRULE:…`).

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

Cet écran hébergera aussi la gestion des **notifications push** (opt-in par
appareil) — voir la feuille de route notifications.

## 7. Routes de l'application

| Route | Contenu |
|---|---|
| `/login` | Grille des profils + connexion / première connexion / changement de mot de passe |
| `/` | Écran d'accueil (message de bienvenue, compteurs, activité du jour) |
| `/tasks` | Liste des tâches (onglets, recherche, filtres) |
| `/tasks/new` | Formulaire de création |
| `/tasks/[id]` | Détail d'une tâche (statut, assignés/lecteurs, tags, checklist, commentaires, icône « Ajouter à Google Agenda » si datée) — 404 si l'utilisateur n'a pas `canView` |
| `/tasks/[id]/edit` | Formulaire de modification — 404 si l'utilisateur n'a pas `canEdit` |
| `/compte` | Mon compte : identité + « Modifier mon mot de passe » (voir 6.14) |
| `/admin` | Statistiques par utilisateur (voir 6.9) — 404 si le compte n'a pas le rôle `admin` |
| `/api/version` | Repère de version pour le rafraîchissement automatique (voir 6.8) — pas une page, aucune UI |

Toutes les routes sauf `/login` et `/api/version` exigent une session
valide (appliqué par le middleware) ; `/tasks/[id]` et `/tasks/[id]/edit`
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
  tourne côté serveur, donc à l'heure de Vercel/UTC sans ça).
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
se compensant dans l'appli mais pas ailleurs (lien Google Agenda, §6.13).
Les 12 échéances déjà en base ont été réalignées le 04/09/2026 par
`supabase/fix_due_at_timezone_2026-09-04.sql` (script ponctuel, à ne pas
rejouer).

**Reste une limite mineure** : `computeNextOccurrence()` (régénération
d'une tâche récurrente, `src/lib/format.ts`) décale l'échéance en UTC —
une occurrence qui franchit un changement d'heure peut dériver d'1 h en
heure murale de Paris. Sans conséquence pratique (tâches récurrentes,
±1 h, deux fois par an).

### 8.2 Quatre pièges de cache déjà rencontrés et corrigés

Documentés en détail dans `claude/prototype-notes.md` ; résumé pour
mémoire, en cas de nouveau symptôme d'affichage périmé après création,
modification ou suppression d'une tâche :

1. **Rendu statique** — une page sans appel à une "dynamic function"
   (`cookies()`, etc.) peut être pré-rendue au build et figer ses
   données. Corrigé par `export const dynamic = "force-dynamic"` sur
   chaque page qui affiche des données mutables.
2. **Data Cache de `fetch()`** — Next.js met en cache les requêtes GET
   faites via `fetch()`, y compris celles du SDK Supabase, même sur une
   page dynamique. Corrigé une fois pour toutes dans
   `src/lib/supabase/admin.ts` (`cache: "no-store"` forcé sur le client
   admin).
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
   Nom de cache passé en `v2` pour purger l'ancien cache chez les
   utilisateurs déjà installés, et `Cache-Control: no-cache` ajouté sur
   `/sw.js` (`next.config.mjs`) pour que les futures mises à jour du
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

### 8.3 Faille de confidentialité initiale — corrigée le 01/09/2026

Une version antérieure de l'application ne filtrait les tâches privées
que sur l'onglet dédié "Privées" : l'onglet "Toutes" (par défaut) et la
page de détail `/tasks/[id]` ne les excluaient pas, ce qui rendait une
tâche privée d'un autre membre visible dans la liste et accessible par
son URL directe. Ce point a été corrigé par la refonte du modèle de
confidentialité/partage décrite en 6.1 : l'accès est désormais vérifié à
la **requête** (`getTasks`/`getTask`) et non plus seulement à
l'affichage, et de la même façon pour chaque Server Action de mutation.
Conservé ici pour mémoire — voir `claude/prototype-notes.md` pour le
détail de la découverte et de la décision de refonte plutôt que d'un
correctif ponctuel.

### 8.4 Fonctionnalités non implémentées

Conformément au phasage du cahier des charges :

- Offline-first réel (file d'attente IndexedDB + réconciliation à la
  reconnexion) — le service worker actuel (`public/sw.js`) ne fait que
  mettre en cache l'app shell pour l'installabilité PWA.
- Notifications Web Push et App Badge (nécessitent des clés VAPID et une
  fonction serveur d'envoi).
- Interface d'administration pour la création de comptes (actuellement
  faite directement en SQL dans Supabase).

## 9. Charte graphique

Palette définie dans `tailwind.config.ts` : accent orange (`brand`
`#E2621F`, dégradé vers `#F3A467`), fond écru (`paper` `#F5EBD8`, cartes
`surface` `#FFFCF5`, `sand` pour les fonds neutres/hover), bordures
(`line`/`line-soft`). Icônes : jeu SVG inline maison
(`src/components/Icons.tsx`, trait fin, couleur pilotée par
`currentColor`), remplaçant les emoji d'origine pour un rendu cohérent
sur toutes les plateformes. Icône PWA regénérable via
`node scripts/gen-icons.js`.

## 10. Workflow de développement et de déploiement

- **Pas de copie de travail locale dans le flux retenu** : le code est
  écrit depuis une session cloud Claude et livré en `.zip`; l'utilisateur
  dépose le contenu sur GitHub via "Add file → Upload files" (interface
  web, sans `git` ni `npm` local). Vercel redéploie automatiquement à
  chaque push sur la branche par défaut. Le dépôt a été passé en public le
  03/09/2026, ce qui permet désormais à une session Claude de le cloner
  directement en lecture (`git clone`) pour lire le code existant avant
  d'y apporter des modifications, sans changer le mode de livraison
  (toujours en `.zip`, jamais de push direct depuis la session cloud — le
  pare-feu réseau de la session bloque ça, voir
  `claude/prototype-notes.md`).
- **Piège de cet upload web** : il ajoute/écrase les fichiers présents
  dans le zip mais **ne supprime jamais** un fichier absent du zip qui
  existait déjà sur GitHub. Toute livraison qui supprime un fichier côté
  code doit donc le signaler explicitement pour suppression manuelle sur
  GitHub.
- **Toujours livrer un zip complet et autonome** (leçon du 02/09/2026,
  après un échec de build causé par un zip ne contenant qu'une partie des
  fichiers touchés par une fonctionnalité) : lister les fichiers modifiés
  (`git diff --name-only`), les inclure tous dans un seul zip, et
  vérifier son contenu (`unzip -l`, recherche des symboles utilisés)
  avant de le livrer — plutôt que plusieurs livraisons partielles.
- **Vérification TypeScript en deux passes avant toute livraison**
  (leçon du 02/09/2026, après un échec de build en production dû à un
  conflit de type qu'un check permissif n'avait pas détecté) : une passe
  permissive (`strict: false`) puis une passe stricte (`strict: true`,
  `noImplicitAny: false` — ce dernier flag neutralise le bruit propre au
  shim maison, qui type les dépendances externes en `any` et fait perdre
  l'inférence de type sur les résultats Supabase, sans rapport avec un
  vrai risque de conflit de type) sur le même shim TypeScript maison — la
  passe stricte rattrape les conflits d'intersection de types que le mode
  permissif laisse passer.
- **Évolutions du schéma de base** : toujours via un nouveau fichier
  numéroté dans `supabase/migrations/` (additif : `add column if not
  exists`, `create table if not exists`, jamais de `drop`) — jamais en
  réexécutant `supabase/recreate_full_schema.sql`, qui est un reset
  destructeur pour la base de production (voir 5.1). Penser à répercuter
  chaque migration dans `recreate_full_schema.sql` pour qu'il reste le
  reflet fidèle de la structure. Migrations à ce jour :
  `001_categories_and_tags.sql`, `002_sharing_roles.sql`,
  `003_last_login.sql`, `004_checklist.sql`, `005_activity_log.sql`.
- **Variables d'environnement** (Vercel → Project Settings → Environment
  Variables, type "Secret") : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  (Supabase → Project Settings → API), `SESSION_SECRET` (chaîne aléatoire
  générée une fois, ex. `openssl rand -base64 48`). Détail dans
  `.env.example` et `README.md`.

## 11. Inventaire des fichiers principaux

| Fichier | Rôle |
|---|---|
| `src/middleware.ts` | Garde d'authentification (Edge) |
| `src/lib/auth.ts` | Hash de mot de passe, session JWT |
| `src/lib/access.ts` | Contrôle d'accès aux tâches (`canView`/`canEdit`/`computeVisibility`/`getTaskAccess`) |
| `src/lib/supabase/admin.ts` | Client Supabase service_role (+ `cache: "no-store"`) |
| `src/lib/queries.ts` | Lectures (profils, tâches, tags, commentaires, stats admin, activité — `getRecentActivity`) — filtrées par `access.ts` |
| `src/lib/actions.ts` | Server Actions (écritures : auth, tâches, tags, commentaires, checklist, journal d'activité — `logActivity`) — vérifiées par `access.ts` |
| `src/lib/types.ts` | Types TypeScript partagés (dont `ActivityType`/`ActivityLogEntry`) |
| `src/lib/format.ts` | Formatage de dates (heure de Paris), statuts, récurrence, clés de jour civil |
| `src/lib/timezone.ts` | `APP_TIMEZONE` (Europe/Paris) + conversions heure murale de Paris ⇄ instant UTC (voir 8.1) |
| `src/lib/calendar.ts` | `googleCalendarUrl()` — lien de création d'événement Google Agenda depuis une tâche (voir 6.13) |
| `src/lib/categories.ts` | Libellés/icônes/ordre des catégories |
| `src/components/Icons.tsx` | Jeu d'icônes SVG inline |
| `src/components/TaskForm.tsx` | Formulaire création/modification de tâche, sélecteur de partage par personne |
| `src/components/TaskFilterList.tsx` | Recherche (toujours visible) + volet dépliable "Filtres" replié par défaut (portée/statut actifs/catégorie/échéance/partagé-privé/en retard/tags), séparateurs verticaux masqués sur mobile — plus de `FilterTabs.tsx`, retiré le 03/09/2026 |
| `src/components/HomeDashboard.tsx` | Compteurs de l'écran d'accueil (en retard/aujourd'hui/cette semaine) |
| `src/components/ActivityFeed.tsx` | Fil "Activité du jour" de l'écran d'accueil (voir 6.12) |
| `src/components/LoginForm.tsx` | Écran de connexion / première connexion |
| `src/app/compte/page.tsx` + `src/components/AccountPasswordForm.tsx` | Écran « Mon compte » : changement de mot de passe connecté (voir 6.14) |
| `src/components/ServiceWorkerRegister.tsx` | Enregistrement du service worker + revérification à chaque retour au premier plan |
| `src/components/AppUpdateWatcher.tsx` | Rafraîchissement automatique à l'ouverture si une nouvelle version est déployée (voir 6.8) |
| `src/app/api/version/route.ts` | Repère de version interrogé par `AppUpdateWatcher.tsx` |
| `src/app/admin/page.tsx` | Statistiques par utilisateur, réservé au rôle admin (voir 6.9) |
| `src/components/ChecklistSection.tsx` | Checklist d'une tâche sur l'écran de détail (voir 6.10) |
| `src/components/PendingOverlay.tsx` | Gel d'écran global + indicateur de traitement en cours (voir 6.11) |
| `src/components/CommentThread.tsx` | Fil de commentaires + suppression (auteur ou créateur de la tâche — voir 6.5) |
| `supabase/recreate_full_schema.sql` | Référence structurelle complète, à jour et exécutable (reset — réservé à un sinistre, voir 5.1 et 5.3) |
| `supabase/migrations/` | Évolutions additives appliquées sur la base réelle |
| `supabase/fix_due_at_timezone_2026-09-04.sql` | Correction ponctuelle des données (réalignement des échéances sur Europe/Paris) — déjà appliquée, à ne pas rejouer (voir 8.1) |

# To-Do List Familiale — Documentation technique

Dernière mise à jour : 01/09/2026. Ce document décrit l'application telle
qu'elle existe à ce jour (dépôt `nicolasdalmont/todolist-familiale`) : pile
technique, architecture, modèle de données, fonctionnalités, écrans, et
points d'attention connus. Il complète le `README.md` (installation,
variables d'environnement) et `claude/prototype-notes.md` dans le Projet
Claude (journal chronologique des décisions et des correctifs).

## 1. Vue d'ensemble

Application web responsive (PWA installable) de gestion de tâches
partagées en famille. Chaque membre de la famille dispose d'un profil
(prénom + mot de passe personnel) ; les tâches peuvent être partagées entre
tous ou privées à leur créateur, classées par catégorie, taguées
librement, planifiées avec une échéance et une récurrence, et commentées.
Un écran d'accueil résume les tâches à traiter en priorité.

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
                          └─ Server Actions ("use server") : écrivent dans Supabase
                                          │
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
  quoi) est donc entièrement gérée dans le code Next.js, pas dans Postgres
  — voir la section 8 (limites connues) pour la nuance importante sur la
  visibilité "privée".
- **Aucune API REST/GraphQL exposée** : tout passe par des Server
  Components (lecture, au chargement de page) et des Server Actions
  (écriture, déclenchées par des formulaires ou des boutons). Il n'y a pas
  de route `/api/*`.

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
  Un lien "Changer mon mot de passe" permet de le faire à tout moment
  après connexion.
- **Création de compte** : pas d'interface dédiée — se fait en SQL direct
  dans Supabase (voir README, section "Authentification"). Claude peut
  précalculer le hash scrypt d'un mot de passe temporaire sur demande.
- **Mot de passe oublié** : l'administrateur redéfinit `password_hash` en
  base et repasse `password_set` à `false` ; l'utilisateur retombe sur le
  flux de première connexion.

## 5. Modèle de données

### 5.1 Le script `supabase/schema.sql` couvre-t-il tout le modèle ?

**Oui, structurellement.** Les six tables qu'il crée (`users`, `tasks`,
`task_assignees`, `comments`, `tags`, `task_tags`) sont exactement les six
tables que le code interroge (vérifié par recherche de tous les appels
`.from(...)` dans `src/lib/`) — il n'existe aucune table utilisée par
l'application qui soit absente de ce script.

**Mais avec deux nuances importantes :**

1. **C'est un script de reset (`drop table ... cascade` puis
   `create table`), pas une migration.** Il ne doit **plus être
   réexécuté tel quel** sur la base de production : elle contient
   désormais de vrais comptes et de vraies tâches, que ce script
   détruirait. Depuis la fonctionnalité catégories/tags, les évolutions du
   schéma passent par des scripts additifs numérotés dans
   `supabase/migrations/` (premier fichier :
   `001_categories_and_tags.sql`, qui a ajouté la colonne `category` et
   les tables `tags`/`task_tags` sans rien supprimer). `schema.sql` sert
   uniquement de **référence versionnée** de la structure complète et
   sert à provisionner un nouvel environnement à partir de zéro (ex. un
   second projet Supabase de test).
2. **Le contenu (les lignes) inséré par ce script ne reflète que l'état
   initial**, pas les données réelles actuelles : il crée un seul
   utilisateur `Admin` (mot de passe temporaire `bonjour2026`) et neuf
   tags de départ. En production, `Admin` a été renommé `Nicolas`, les
   autres membres de la famille ont été ajoutés manuellement en SQL, et
   la liste des tags s'est enrichie depuis le formulaire de tâche. Le
   script décrit donc fidèlement la **structure** des tables (colonnes,
   contraintes, types), mais pas leur **contenu** actuel.

Un reliquat mineur : le script contient encore une ligne
`drop table if exists public.profiles cascade;`, héritée d'une
architecture intermédiaire (comptes Supabase Auth par profil) abandonnée
avant la mise en production — elle est inoffensive (`if exists`) mais
n'a plus d'objet.

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
| `visibility` | text | `shared` \| `private` |
| `category` | text | 7 valeurs fixes — voir 6.2 |
| `created_by` | uuid → `users.id` | |
| `created_at` | timestamptz | |

**`task_assignees`** — table de liaison many-to-many `tasks` ↔ `users`
(une tâche peut être assignée à plusieurs personnes).

**`comments`** — fil de discussion par tâche (`task_id`, `author_id`,
`body`, `created_at`).

**`tags`** — libellés libres (`id`, `name` unique, `created_at`), créés à
la volée depuis le formulaire de tâche, normalisés en minuscules/sans
espaces superflus pour éviter les doublons.

**`task_tags`** — table de liaison many-to-many `tasks` ↔ `tags`.

Toutes les tables ont `row level security` activé et **aucune policy** —
voir section 3.

## 6. Fonctionnalités

### 6.1 Cycle de vie d'une tâche

Statuts : `todo` (à faire) → `in_progress` (en cours) → `done` (terminée)
→ `archived` (archivée). Les quatre boutons de statut
(`StatusButtons.tsx`) sont toujours tous visibles sur l'écran de détail :
il n'y a pas de machine à états stricte, n'importe quel statut peut être
choisi depuis n'importe quel autre.

À la création, le créateur est automatiquement ajouté aux assignés
(impossible de le retirer à la création ; possible en modification).
Visibilité `shared` (tout le monde) ou `private` (créateur uniquement, en
intention — voir 8.1 pour la limite actuelle).

### 6.2 Catégorie

Chaque tâche a une catégorie principale à choix unique, valeur fixe
(contrainte `check` en base) : `achats`, `autre`, `cadeaux`, `enfants`,
`famille`, `maison`, `vacances` — triées par ordre alphabétique dans
l'interface. Libellés et icônes associées centralisés dans
`src/lib/categories.ts`. Affichée sur la carte de tâche et l'écran de
détail.

### 6.3 Récurrence

Stockée en JSON dans `tasks.recurrence` : `{ type: "none" | "daily" |
"weekly" | "monthly" | "custom", interval?, unit?: "days"|"weeks"|"months" }`.
Quand une tâche récurrente passe à `done`
(`setStatusAction` dans `src/lib/actions.ts`), la prochaine occurrence est
calculée (`computeNextOccurrence` dans `src/lib/format.ts`) à partir de
l'échéance actuelle, puis une nouvelle tâche `todo` est créée avec le même
titre, la même description, la même catégorie, la même visibilité, les
mêmes assignés et les mêmes tags. Si la tâche récurrente n'a pas
d'échéance, aucune occurrence n'est régénérée (rien à incrémenter).

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

Fil de discussion simple par tâche (`comments`), affiché du plus ancien
au plus récent, sans édition ni suppression une fois posté.

### 6.6 Écran d'accueil (`/`)

Message de bienvenue ("Bonjour, {Prénom}" + date du jour) et deux tuiles
cliquables (`HomeDashboard.tsx`), calculées **côté client** (voir 7.3
sur la raison de ce choix) à partir de la liste complète des tâches :

- **Aujourd'hui** : nombre de tâches ouvertes (`todo`/`in_progress`) dont
  l'échéance tombe le jour même.
- **Cette semaine** : nombre de tâches ouvertes dont l'échéance tombe
  entre aujourd'hui et le dimanche à venir inclus (semaine restante, pas
  lundi-dimanche).

Chaque tuile est un lien vers `/tasks?dueAtMost=YYYY-MM-DD` (voir 6.7) :
le nombre affiché sur la tuile (échéance strictement dans la période) peut
donc différer du nombre de tâches affichées après le clic, qui inclut en
plus tout ce qui est déjà en retard — comportement voulu.

### 6.7 Liste des tâches, recherche et filtres (`/tasks`)

- **Onglets de statut** (`FilterTabs.tsx`, résolus côté serveur via
  `?filter=`) : Toutes (tout sauf archivées), Mes tâches, Partagées,
  Privées, Terminées, Archivées.
- **Recherche par mots-clefs, filtre catégorie, filtre tags, filtre
  d'échéance** (`TaskFilterList.tsx`, appliqués côté client par-dessus le
  résultat serveur, en mémoire — la liste d'une famille reste petite) :
  - Recherche : sous-chaîne insensible à la casse sur titre + description.
  - Catégorie : une seule sélectionnée à la fois.
  - Tags : sélection multiple, logique OR (une tâche matche si elle a au
    moins un des tags cochés).
  - Échéance : `<input type="date">` "au plus tard le" — ne garde que les
    tâches ayant une échéance renseignée et inférieure ou égale à la date
    choisie (donc y compris les tâches en retard). Peut être pré-rempli
    via `?dueAtMost=` (utilisé par les tuiles de l'accueil, section 6.6).

## 7. Routes de l'application

| Route | Contenu |
|---|---|
| `/login` | Grille des profils + connexion / première connexion / changement de mot de passe |
| `/` | Écran d'accueil (message de bienvenue, compteurs) |
| `/tasks` | Liste des tâches (onglets, recherche, filtres) |
| `/tasks/new` | Formulaire de création |
| `/tasks/[id]` | Détail d'une tâche (statut, assignés, tags, commentaires) |
| `/tasks/[id]/edit` | Formulaire de modification |

Toutes les routes sauf `/login` exigent une session valide (appliqué par
le middleware). La racine `/` a hébergé la liste des tâches jusqu'au
01/09/2026 ; elle héberge désormais l'écran d'accueil, et la liste a
déménagé vers `/tasks` (voir `claude/prototype-notes.md` pour l'historique
de ce changement et la liste des redirections mises à jour en
conséquence).

## 8. Limites connues et points d'attention

### 8.1 Visibilité "privée" : filtrage incomplet (à corriger)

La visibilité `private` n'est **pas appliquée par RLS** (aucune policy
n'existe, par conception — voir section 3) ; elle repose entièrement sur
le filtrage applicatif. Or ce filtrage n'est aujourd'hui complet que sur
l'onglet dédié "Privées" (qui ne montre que les tâches privées du membre
connecté). **L'onglet "Toutes" (par défaut) et l'écran de détail
`/tasks/[id]` n'excluent pas les tâches privées créées par d'autres
membres** : une tâche privée créée par quelqu'un d'autre peut donc
apparaître dans la liste "Toutes", et son URL de détail est consultable
par n'importe quel membre connecté qui la connaîtrait ou tomberait
dessus. Dans une famille utilisant la catégorie "Cadeaux" avec une
visibilité privée pour garder une surprise, ce comportement peut
effectivement éventer une surprise. **Recommandation : corriger ce point
avant de compter sur "privée" pour cacher quelque chose d'important** —
la correction est simple (filtrer par `created_by` dans le cas par défaut
de `applyFilter`, et vérifier la visibilité dans `getTask`/la page de
détail) et peut être livrée sur demande.

### 8.2 Fuseau horaire

Les Server Components s'exécutent avec l'heure du serveur Vercel (UTC),
qui ne correspond pas forcément au fuseau réel de la famille. Les calculs
sensibles à "aujourd'hui" (compteurs de l'accueil, filtre d'échéance,
badge "en retard") sont donc volontairement effectués **côté client**
(`isOverdue` dans `TaskCard.tsx`, `HomeDashboard.tsx`,
`TaskFilterList.tsx`) plutôt que côté serveur. Le formatage d'affichage
des dates (`formatDate` dans `src/lib/format.ts`), lui, s'exécute côté
serveur et reste donc à l'heure de Vercel — un écart d'affichage d'une
heure ou deux (mais pas de jour) reste possible sur l'heure affichée.

### 8.3 Trois pièges de cache Next.js déjà rencontrés et corrigés

Documentés en détail dans `claude/prototype-notes.md` ; résumé pour
mémoire, en cas de nouveau symptôme d'affichage périmé :

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
  écrit depuis une session cloud Claude et livré en `.zip` ; l'utilisateur
  dépose le contenu sur GitHub via "Add file → Upload files" (interface
  web, sans `git` ni `npm` local). Vercel redéploie automatiquement à
  chaque push sur la branche par défaut.
- **Piège de cet upload web** : il ajoute/écrase les fichiers présents
  dans le zip mais **ne supprime jamais** un fichier absent du zip qui
  existait déjà sur GitHub. Toute livraison qui supprime un fichier côté
  code doit donc le signaler explicitement pour suppression manuelle sur
  GitHub.
- **Évolutions du schéma de base** : toujours via un nouveau fichier
  numéroté dans `supabase/migrations/` (additif : `add column if not
  exists`, `create table if not exists`, jamais de `drop`) — jamais en
  réexécutant `supabase/schema.sql`, désormais destructeur pour la base de
  production (voir 5.1).
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
| `src/lib/supabase/admin.ts` | Client Supabase service_role (+ `cache: "no-store"`) |
| `src/lib/queries.ts` | Lectures (profils, tâches, tags, commentaires) |
| `src/lib/actions.ts` | Server Actions (écritures : auth, tâches, tags, commentaires) |
| `src/lib/types.ts` | Types TypeScript partagés |
| `src/lib/format.ts` | Formatage de dates, statuts, récurrence, clés de date locale |
| `src/lib/categories.ts` | Libellés/icônes/ordre des catégories |
| `src/components/Icons.tsx` | Jeu d'icônes SVG inline |
| `src/components/TaskForm.tsx` | Formulaire création/modification de tâche |
| `src/components/TaskFilterList.tsx` | Recherche + filtres (catégorie/tags/échéance) |
| `src/components/HomeDashboard.tsx` | Compteurs de l'écran d'accueil |
| `src/components/LoginForm.tsx` | Écran de connexion / première connexion |
| `supabase/schema.sql` | Référence structurelle complète (reset — ne pas réexécuter) |
| `supabase/migrations/` | Évolutions additives appliquées sur la base réelle |

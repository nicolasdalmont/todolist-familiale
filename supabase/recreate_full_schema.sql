-- Script de reconstruction intégrale de la base — À N'UTILISER QU'EN CAS DE
-- SINISTRE (base Supabase perdue, corrompue, ou nouvel environnement de
-- secours à provisionner en urgence).
--
-- Origine : généré le 04/09/2026 à partir d'un export du schéma réel de la
-- base de production (fonction d'export "contexte" de Supabase — le script
-- fourni par l'utilisateur portait l'avertissement "for context only, not
-- meant to be run"). Ce fichier-ci EST exécutable : il complète cet export
-- pour en faire un vrai script de recréation, en y ajoutant ce que l'export
-- "contexte" omet volontairement (voir plus bas) et en le rendant cohérent
-- avec les migrations effectivement appliquées dans supabase/migrations/
-- (001 à 005) et documentées dans docs/documentation-technique.md.
--
-- CE QUE CE SCRIPT FAIT :
--   - Recrée les 10 tables de l'application avec leurs colonnes, valeurs par
--     défaut, contraintes CHECK et clés primaires/étrangères actuelles.
--   - Réactive Row Level Security sur chacune, SANS AUCUNE POLICY — c'est
--     le choix délibéré de ce projet (voir section 3 de la doc technique) :
--     l'accès ne passe jamais par le rôle "anon", uniquement par la clé
--     service_role côté serveur Next.js, qui contourne RLS. Aucune policy
--     ne doit être ajoutée sans revoir cette architecture.
--   - Recrée les deux index de supabase/migrations/005_activity_log.sql.
--   - Sème un unique compte administrateur de secours (voir tout en bas)
--     pour pouvoir se reconnecter à l'application juste après un reset —
--     PAS les autres comptes de la famille ni les tâches existantes.
--
-- CE QUE CE SCRIPT NE FAIT PAS :
--   - Il NE RESTAURE AUCUNE DONNÉE (comptes de la famille, tâches,
--     commentaires, tags personnalisés, etc.) : il recrée uniquement la
--     STRUCTURE, vide. Pour restaurer les données perdues, voir les
--     sauvegardes automatiques de Supabase (Database → Backups) ou un
--     export pg_dump antérieur — ce script n'en tient pas lieu.
--
-- POURQUOI CE SCRIPT DIFFÈRE PAR ENDROITS DU TEXTE BRUT DE L'EXPORT FOURNI :
-- l'export "contexte" de Supabase omet les clauses ON DELETE des clés
-- étrangères (CASCADE / SET NULL) — probablement une simplification de cet
-- export, pensé pour donner du contexte à une IA plutôt que pour être
-- rejoué tel quel. Ce script restaure ces clauses à partir des migrations
-- qui les ont introduites et de leur comportement documenté :
--   - task_assignees, comments, task_tags, checklist_items, et
--     activity_log.task_id : "on delete cascade" — supprimer une tâche
--     doit supprimer tout ce qui lui est rattaché (voir les migrations
--     001/004/005).
--   - activity_log.actor_id : "on delete set null" — une ligne d'activité
--     doit survivre à la suppression du compte de son auteur (elle devient
--     alors invisible dans le fil plutôt que de bloquer la suppression du
--     compte) — comportement documenté en section 6.12/5.2 de la doc
--     technique, introduit par la migration 005_activity_log.sql.
-- Sans cette restauration, une suppression de tâche ou de compte
-- échouerait ou laisserait des lignes orphelines selon les tables — pas
-- seulement une différence cosmétique.
--
-- Deux valeurs par défaut sont prises directement de l'export, qui reflète
-- l'état réel de la base de production au 04/09/2026 :
--   - users.color : défaut '#6C5CE7'.
--   - tasks.visibility : défaut 'shared' — sans conséquence pratique : ce
--     champ est de toute façon recalculé par l'application à chaque
--     création/modification de tâche (computeVisibility() dans
--     src/lib/access.ts), jamais laissé à sa valeur par défaut.
--
-- ORDRE D'EXÉCUTION : ce script se suffit à lui-même (il recrée tout depuis
-- zéro) — ne pas rejouer les migrations 001 à 005 par-dessus, elles sont
-- déjà intégrées ici. Après l'avoir exécuté, les futures évolutions de
-- schéma continuent de passer par de nouveaux fichiers numérotés dans
-- supabase/migrations/ (006, 007, ...), comme d'habitude.

-- ---------------------------------------------------------------------
-- 1. Suppression complète (si la base existe déjà sous une forme ou une
--    autre) — ordre inverse des dépendances, "cascade" en filet de
--    sécurité. "profiles" est un reliquat d'une architecture abandonnée
--    avant la mise en production (comptes Supabase Auth par profil) ;
--    inoffensif si absent.
-- ---------------------------------------------------------------------

drop table if exists public.push_subscriptions cascade;
drop table if exists public.notifications cascade;
drop table if exists public.activity_log cascade;
drop table if exists public.checklist_items cascade;
drop table if exists public.task_tags cascade;
drop table if exists public.tags cascade;
drop table if exists public.comments cascade;
drop table if exists public.task_assignees cascade;
drop table if exists public.tasks cascade;
drop table if exists public.profiles cascade;
drop table if exists public.users cascade;

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

create table public.users (
  id uuid primary key default gen_random_uuid(),
  -- Prénom affiché sur l'écran de connexion ; sert aussi d'identifiant de
  -- connexion (doit donc être unique).
  name text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  color text default '#6C5CE7',
  -- Passe à true une fois que l'utilisateur a remplacé le mot de passe
  -- temporaire par son propre mot de passe.
  password_set boolean not null default false,
  created_at timestamptz default now(),
  -- Dernière activité : dernier rendu de page authentifié, rafraîchi au
  -- plus une fois toutes les 15 min par touchLastSeen() dans
  -- src/lib/auth.ts (et à chaque connexion via recordLogin()). Migration
  -- 003_last_login.sql. Affichée sur l'écran /admin.
  last_login_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  due_at timestamptz,
  recurrence jsonb default '{"type": "none"}',
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'archived')),
  -- Recalculée automatiquement par l'application (computeVisibility() dans
  -- src/lib/access.ts), jamais saisie directement par l'utilisateur.
  visibility text not null default 'shared'
    check (visibility in ('shared', 'private')),
  created_by uuid not null references public.users(id),
  created_at timestamptz default now(),
  -- Catégorie principale de la tâche — voir src/lib/categories.ts pour les
  -- libellés/icônes affichés. Migration 001_categories_and_tags.sql.
  category text not null default 'autre'
    check (category in ('achats', 'autre', 'cadeaux', 'enfants', 'famille', 'maison', 'vacances'))
);

create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  -- "editor" (défaut) : voit, modifie et change le statut de la tâche.
  -- "viewer" : voit et commente la tâche, sans pouvoir la modifier. Le
  -- créateur d'une tâche est toujours "editor" (imposé côté application).
  -- Migration 002_sharing_roles.sql.
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  primary key (task_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  author_id uuid not null references public.users(id),
  body text not null,
  created_at timestamptz default now()
);

-- Tags libres (créés à la volée depuis le formulaire de tâche). Migration
-- 001_categories_and_tags.sql.
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

create table public.task_tags (
  task_id uuid not null references public.tasks(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

-- Checklist (sous-tâches à cocher) d'une tâche — pas de colonne d'ordre
-- dédiée, l'affichage suit created_at. Migration 004_checklist.sql.
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  created_at timestamptz default now()
);

-- Journal d'activité des tâches partagées, alimente le fil "Activité du
-- jour" de l'écran d'accueil. task_title est dénormalisé (recopié au
-- moment de l'action) plutôt que résolu par jointure. Migration
-- 005_activity_log.sql.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  -- "on delete set null" (pas cascade) : une ligne d'activité doit
  -- survivre à la suppression du compte de son auteur plutôt que d'être
  -- supprimée avec lui — elle devient alors invisible dans le fil (filtrée
  -- côté client, voir ActivityFeed.tsx) faute de pouvoir l'attribuer à
  -- quelqu'un, mais la suppression du compte n'est pas bloquée.
  actor_id uuid references public.users(id) on delete set null,
  type text not null,
  task_title text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- Notifications « À ton attention » par utilisateur, alimente le fil sous
-- les compteurs de l'écran d'accueil (src/components/AttentionFeed.tsx).
-- Écrites par src/lib/notifications.ts. Migration 006_notifications.sql.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Abonnements aux notifications push web, un par appareil où la personne a
-- activé les notifications (opt-in, écran "Mon compte"). Migration
-- 007_push_subscriptions.sql.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Index
-- ---------------------------------------------------------------------

create index if not exists activity_log_task_id_idx on public.activity_log(task_id);
create index if not exists activity_log_created_at_idx on public.activity_log(created_at);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- ---------------------------------------------------------------------
-- 4. Row Level Security — activé partout, aucune policy nulle part (voir
--    l'en-tête de ce fichier). Le rôle "anon" n'a donc accès à rien ;
--    l'application interroge exclusivement via la clé service_role, qui
--    contourne RLS par conception.
-- ---------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.comments enable row level security;
alter table public.tags enable row level security;
alter table public.task_tags enable row level security;
alter table public.checklist_items enable row level security;
alter table public.activity_log enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

-- ---------------------------------------------------------------------
-- 5. Amorçage minimal — un seul compte administrateur pour pouvoir se
--    reconnecter à l'application juste après ce reset. Mot de passe
--    temporaire "bonjour2026" (même convention que le tout premier
--    déploiement) ; l'application demandera de le remplacer dès la
--    première connexion (password_set = false). Le hash ci-dessous a été
--    précalculé avec le même schéma que src/lib/auth.ts::hashPassword()
--    (scrypt, sel 16 octets, clé dérivée 64 octets, format
--    "sel_hex:cle_derivee_hex").
--
--    Renommer ce compte et recréer les autres membres de la famille
--    ensuite, à la main, en SQL (pas d'interface dédiée pour l'instant —
--    voir section 8.4 de la doc technique) :
--      insert into public.users (name, password_hash, role, password_set)
--      values ('Prénom', '<hash précalculé par Claude sur demande>', 'user', false);
-- ---------------------------------------------------------------------

insert into public.users (name, password_hash, role, password_set)
values (
  'Admin',
  '20c157fefadb802bdfb58b1497c8714a:5f02d5b5cf9ea4da6734293880560daf0d23ad04bd243900b088b3517d82126d6de47b68d77db2b088b662765e3c0738453218a74ab286a816ce87e2f3045de8',
  'admin',
  false
);

-- Tags de départ proposés à la création d'une tâche (la liste s'enrichit
-- ensuite librement depuis le formulaire).
insert into public.tags (name) values
  ('maison'), ('enfants'), ('achats'), ('famille'), ('cadeaux'),
  ('vacances'), ('travaux'), ('impots'), ('factures')
on conflict (name) do nothing;

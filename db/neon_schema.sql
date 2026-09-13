-- Checkberry — schéma pour Neon (Postgres nu).
-- Version adaptée de supabase/recreate_full_schema.sql — voir
-- docs/migration-neon.md.
--
-- Différences avec la version Supabase :
--   - extension pgcrypto déclarée explicitement pour gen_random_uuid()
--     (native en PG13+, donc déjà OK sur Neon PG16 — par sécurité).
--   - plus aucune ligne "enable row level security" : on se connecte à
--     Neon en propriétaire de la base (DATABASE_URL), exempté de RLS. La
--     base n'est jamais jointe depuis le navigateur (accès 100 % serveur
--     via src/lib/db.ts). Rien à protéger par policy.
--   - tout le reste est identique : les 12 tables, les contraintes CHECK
--     (statuts/visibilité en text+check, pas d'enum de type), les clés
--     PK/FK avec leurs ON DELETE, les index, l'amorçage.
--
-- À exécuter une fois sur le projet Neon (SQL Editor du dashboard, ou
--   psql "$NEON_DIRECT_URL" -f db/neon_schema.sql).
--
-- Les "drop table if exists" ci-dessous suppriment tables ET données si
-- elles existent. Sur un projet neuf : sans effet.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Suppression préalable (ordre inverse des dépendances)
-- ---------------------------------------------------------------------

drop table if exists public.push_subscriptions cascade;
drop table if exists public.notifications cascade;
drop table if exists public.reward_achievements cascade;
drop table if exists public.challenge_results cascade;
drop table if exists public.reward_tiers cascade;
drop table if exists public.health_activity_assignees cascade;
drop table if exists public.health_activities cascade;
drop table if exists public.car_activity_assignees cascade;
drop table if exists public.car_activities cascade;
drop table if exists public.garden_activity_assignees cascade;
drop table if exists public.garden_activities cascade;
drop table if exists public.garden_activity_categories cascade;
drop table if exists public.activity_log cascade;
drop table if exists public.user_activity_log cascade;
drop table if exists public.checklist_items cascade;
drop table if exists public.task_tags cascade;
drop table if exists public.tags cascade;
drop table if exists public.categories cascade;
drop table if exists public.app_settings cascade;
drop table if exists public.comments cascade;
drop table if exists public.task_assignees cascade;
drop table if exists public.tasks cascade;
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
  -- Passe à true une fois le mot de passe temporaire remplacé.
  password_set boolean not null default false,
  created_at timestamptz default now(),
  -- "Dernière activité" : dernier rendu de page authentifié, rafraîchi au
  -- plus une fois toutes les 15 min (touchLastSeen(), src/lib/auth.ts).
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
  -- Recalculée par l'application (computeVisibility(), src/lib/access.ts).
  visibility text not null default 'shared'
    check (visibility in ('shared', 'private')),
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now(),
  -- Slug de catégorie ; FK ajoutée après la création de public.categories.
  category text not null default 'autre',
  -- Origine "activité Jardin" (migration 003, voir src/lib/garden.ts) —
  -- "on delete set null" : une tâche déjà clôturée survit à la suppression
  -- de son activité (juste dépouillée de son origine).
  garden_activity_id uuid,
  garden_occurrence_month smallint,
  garden_occurrence_year int,
  -- Origine "activité Voiture" (migration 005, voir src/lib/car.ts) et
  -- "activité Santé" (migration 007, voir src/lib/health.ts) — même
  -- convention "on delete set null" que garden_activity_id ci-dessus.
  car_activity_id uuid,
  health_activity_id uuid
);

create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  -- "editor" : voit, modifie, change le statut. "viewer" : voit et
  -- commente seulement. Le créateur est toujours "editor" (imposé côté app).
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  primary key (task_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- Catégories de tâches, gérables depuis l'écran admin. `slug` = clé stockée
-- dans tasks.category ; `icon` = nom choisi dans CATEGORY_ICON_CHOICES
-- (src/lib/categories.ts).
create table public.categories (
  slug text primary key,
  label text not null,
  icon text not null default 'dots',
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tasks
  add constraint tasks_category_fkey
  foreign key (category) references public.categories(slug) on delete restrict;

-- Réglages d'instance : une seule ligne (id = 1).
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  reminder_enabled boolean not null default true,
  -- Activation individuelle des agendas (migration 009) — voir
  -- src/lib/agendas.ts.
  jardin_enabled boolean not null default true,
  voiture_enabled boolean not null default true,
  sante_enabled boolean not null default true,
  finances_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Tags libres (créés à la volée depuis le formulaire de tâche).
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

-- Checklist d'une tâche — pas de colonne d'ordre, l'affichage suit created_at.
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  created_at timestamptz default now()
);

-- Journal d'activité des tâches partagées (fil "Activité du jour").
-- task_title dénormalisé. actor_id "on delete set null" : une ligne
-- d'activité survit à la suppression de son auteur (devient invisible dans
-- le fil plutôt que de bloquer la suppression du compte).
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  type text not null,
  task_title text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- Streak personnel (migration 001, voir src/lib/streaks.ts) : table
-- volontairement minimale (pas de référence de tâche, pas de contenu),
-- alimentée pour TOUTE tâche privée ou partagée, contrairement à
-- activity_log ci-dessus qui ne l'est jamais pour une tâche privée.
create table public.user_activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Paliers de récompense (migration 002, voir src/lib/rewards.ts) : un
-- palier configuré par l'admin (portée individuelle sur le streak, ou
-- collective sur les défis familiaux réussis cumulés), un seuil, et un
-- libellé de récompense en texte libre — la récompense est négociée en
-- famille, hors appli.
create table public.reward_tiers (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('individual', 'collective')),
  metric text not null check (metric in ('streak_days', 'challenges_completed')),
  threshold int not null check (threshold > 0),
  reward_label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Résultat figé d'une semaine de défi une fois celle-ci terminée — permet
-- de compter les défis réussis cumulés sans recalculer indéfiniment le
-- passé à partir d'activity_log.
create table public.challenge_results (
  week_start date primary key,
  success boolean not null,
  computed_at timestamptz not null default now()
);

create table public.reward_achievements (
  id uuid primary key default gen_random_uuid(),
  tier_id uuid not null references public.reward_tiers(id) on delete cascade,
  -- null pour un palier collectif (toute la famille) ; renseigné pour un
  -- palier individuel. Deux index uniques partiels ci-dessous au lieu d'une
  -- contrainte unique(tier_id, user_id) : Postgres ne considère pas deux
  -- NULL comme égaux, une contrainte simple laisserait passer des doublons
  -- collectifs.
  user_id uuid references public.users(id) on delete cascade,
  achieved_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'given')),
  given_at timestamptz,
  given_by uuid references public.users(id) on delete set null
);

-- Catégories des activités de jardin (migration 004, voir
-- src/lib/garden-categories.ts) : axe de classement séparé des catégories
-- de tâches (table `categories` ci-dessus) — une activité de jardin est
-- "Taille"/"Semis"/"Plantation"/"Autre", indépendamment de la catégorie
-- "Jardin" unique que porte la tâche générée dans l'onglet Tâches. Même
-- forme et mêmes icônes que `categories` (CATEGORY_ICON_CHOICES, réutilisé
-- tel quel).
create table public.garden_activity_categories (
  slug text primary key,
  label text not null,
  icon text not null default 'dots',
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Activités récurrentes du jardin (migration 003, voir src/lib/garden.ts) :
-- un nom, une description, un ensemble de mois de l'année (`months`) et un
-- ou plusieurs responsables (garden_activity_assignees, many-to-many comme
-- task_assignees). Distinct de la récurrence des tâches (tasks.recurrence,
-- à intervalle fixe) : une activité de jardin récurre sur un ensemble de
-- périodes précises, pas à intervalle régulier.
create table public.garden_activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  months smallint[] not null check (array_length(months, 1) > 0),
  -- Slug de catégorie d'activité (migration 004) ; FK ajoutée après la
  -- création de public.garden_activity_categories.
  category text not null default 'autre',
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.garden_activities
  add constraint garden_activities_category_fkey
  foreign key (category) references public.garden_activity_categories(slug) on delete restrict;

create table public.garden_activity_assignees (
  garden_activity_id uuid not null references public.garden_activities(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key (garden_activity_id, user_id)
);

alter table public.tasks
  add constraint tasks_garden_activity_fkey
  foreign key (garden_activity_id) references public.garden_activities(id) on delete set null;

-- Activités récurrentes de la voiture (migration 005, voir
-- src/lib/car.ts) : contrairement à garden_activities (un ensemble de
-- mois porté par une ligne persistante), chaque activité voiture EST une
-- instance datée à part entière (jour+mois+année, ou mois+année si le
-- jour est inconnu) avec sa propre récurrence par intervalle (même forme
-- que tasks.recurrence) et un statut ; sa clôture crée une NOUVELLE ligne
-- (l'instance suivante) plutôt que d'avancer un compteur sur celle-ci.
create table public.car_activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  due_date date not null,
  day_known boolean not null default true,
  recurrence jsonb not null default '{"type":"none"}',
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'archived')),
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.car_activity_assignees (
  car_activity_id uuid not null references public.car_activities(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key (car_activity_id, user_id)
);

alter table public.tasks
  add constraint tasks_car_activity_fkey
  foreign key (car_activity_id) references public.car_activities(id) on delete set null;

-- Activités récurrentes de santé (migration 007, voir src/lib/health.ts) :
-- même modèle que car_activities ci-dessus (instance datée à part
-- entière, pas un ensemble de périodes).
create table public.health_activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  due_date date not null,
  day_known boolean not null default true,
  recurrence jsonb not null default '{"type":"none"}',
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'archived')),
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.health_activity_assignees (
  health_activity_id uuid not null references public.health_activities(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key (health_activity_id, user_id)
);

alter table public.tasks
  add constraint tasks_health_activity_fkey
  foreign key (health_activity_id) references public.health_activities(id) on delete set null;

-- Notifications "À ton attention" par utilisateur.
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

-- Abonnements push web, un par appareil (opt-in, écran "Mon compte").
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
create index if not exists user_activity_log_user_id_idx on public.user_activity_log(user_id, created_at desc);
create unique index if not exists reward_achievements_individual_uidx
  on public.reward_achievements(tier_id, user_id) where user_id is not null;
create unique index if not exists reward_achievements_collective_uidx
  on public.reward_achievements(tier_id) where user_id is null;
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
-- Une seule tâche "ouverte" par activité de jardin à la fois — voir
-- advanceGardenActivity() dans src/lib/garden.ts.
create unique index if not exists tasks_garden_open_occurrence_uidx
  on public.tasks(garden_activity_id)
  where garden_activity_id is not null and status not in ('done', 'archived');
-- Même principe pour Voiture et Santé — voir advanceCarActivity()/
-- advanceHealthActivity() (src/lib/car.ts, src/lib/health.ts).
create unique index if not exists tasks_car_open_occurrence_uidx
  on public.tasks(car_activity_id)
  where car_activity_id is not null and status not in ('done', 'archived');
create unique index if not exists tasks_health_open_occurrence_uidx
  on public.tasks(health_activity_id)
  where health_activity_id is not null and status not in ('done', 'archived');

-- ---------------------------------------------------------------------
-- 4. Amorçage minimal
--    Compte administrateur de secours pour la première connexion.
--    « Admin » / « bonjour2026 » — password_set = false : l'app demande de
--    remplacer ce mot de passe dès la première connexion. Hash scrypt
--    précalculé (même schéma que src/lib/auth.ts::hashPassword()).
--    Se connecter, définir son mot de passe, puis créer les autres membres
--    depuis l'onglet Admin → « Membres ».
-- ---------------------------------------------------------------------

insert into public.users (name, password_hash, role, password_set)
values (
  'Admin',
  '20c157fefadb802bdfb58b1497c8714a:5f02d5b5cf9ea4da6734293880560daf0d23ad04bd243900b088b3517d82126d6de47b68d77db2b088b662765e3c0738453218a74ab286a816ce87e2f3045de8',
  'admin',
  false
)
on conflict (name) do nothing;

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

insert into public.categories (slug, label, icon, position) values
  ('achats',   'Achats',   'shopping', 0),
  ('autre',    'Autre',    'dots',     1),
  ('cadeaux',  'Cadeaux',  'gift',     2),
  ('enfants',  'Enfants',  'baby',     3),
  ('famille',  'Famille',  'users',    4),
  ('maison',   'Maison',   'home',     5),
  ('vacances', 'Vacances', 'sun',      6),
  ('jardin',   'Jardin',   'leaf',     7),
  ('voiture',  'Voiture',  'car',      8),
  ('sante',    'Santé',    'heart',    9)
on conflict (slug) do nothing;

insert into public.garden_activity_categories (slug, label, icon, position) values
  ('taille',     'Taille',     'wrench', 0),
  ('semis',      'Semis',      'leaf',   1),
  ('plantation', 'Plantation', 'sun',    2),
  ('autre',      'Autre',      'dots',   3)
on conflict (slug) do nothing;

insert into public.tags (name) values
  ('maison'), ('enfants'), ('achats'), ('famille'), ('cadeaux'),
  ('vacances'), ('travaux'), ('impots'), ('factures')
on conflict (name) do nothing;

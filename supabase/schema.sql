-- Schéma de référence pour le projet Supabase de la To-Do List Familiale.
--
-- Architecture d'authentification : maison, pas Supabase Auth. Supabase ne
-- sert que de base Postgres. La table "users" stocke un prénom et un hash
-- de mot de passe (scrypt, calculé côté Next.js — voir src/lib/auth.ts) ;
-- Next.js s'y connecte exclusivement côté serveur avec la clé service_role,
-- qui contourne Row Level Security par conception. RLS reste activé sur
-- toutes les tables mais SANS AUCUNE POLICY : ceinture-bretelles en cas de
-- fuite de la clé anon, puisque aucun accès légitime ne devrait jamais
-- passer par elle.
--
-- ATTENTION — ce script est un RESET complet (drop + recreate) : il était
-- prévu pour une base sans données réelles. CE N'EST PLUS LE CAS depuis la
-- création des comptes familiaux et des premières tâches : NE PLUS
-- RÉEXÉCUTER CE FICHIER TEL QUEL sur la base de production, sous peine de
-- tout perdre. Il est conservé comme référence versionnée du schéma complet
-- (utile pour un nouvel environnement, ou pour comparer l'état attendu).
-- Les évolutions du schéma sur la base existante passent désormais par des
-- scripts additifs dans supabase/migrations/ (voir ce dossier).

drop table if exists public.comments cascade;
drop table if exists public.task_assignees cascade;
drop table if exists public.tasks cascade;
drop table if exists public.profiles cascade;
drop table if exists public.users cascade;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  -- Prénom affiché sur l'écran de connexion ; sert aussi d'identifiant de
  -- connexion (doit donc être unique).
  name text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  color text default '#B84B15',
  -- Passe à true une fois que l'utilisateur a remplacé le mot de passe
  -- temporaire par son propre mot de passe.
  password_set boolean not null default false,
  created_at timestamptz default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  due_at timestamptz,
  recurrence jsonb default '{"type":"none"}',
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'archived')),
  -- Recalculée automatiquement par l'application (jamais saisie
  -- directement) à partir du partage effectif dans task_assignees :
  -- "private" si seul le créateur y a accès, "shared" sinon.
  visibility text not null default 'private'
    check (visibility in ('shared', 'private')),
  -- Catégorie principale de la tâche, valeurs fixes (voir
  -- src/lib/categories.ts pour les libellés/icônes affichés).
  category text not null default 'autre'
    check (category in ('achats', 'autre', 'cadeaux', 'enfants', 'famille', 'maison', 'vacances')),
  created_by uuid references public.users(id) not null,
  created_at timestamptz default now()
);

create table public.task_assignees (
  task_id uuid references public.tasks(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  -- "editor" (défaut) : voit, modifie et change le statut de la tâche.
  -- "viewer" : voit et commente la tâche, sans pouvoir la modifier.
  -- Le créateur d'une tâche est toujours "editor" (imposé côté
  -- application). La colonne "visibility" de "tasks" est recalculée
  -- automatiquement à partir de ce partage — voir src/lib/access.ts.
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  primary key (task_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  author_id uuid references public.users(id) not null,
  body text not null,
  created_at timestamptz default now()
);

-- Tags libres (créés à la volée depuis le formulaire de tâche), utilisés
-- pour la recherche/le filtrage sur le tableau de bord.
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

create table public.task_tags (
  task_id uuid references public.tasks(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

alter table public.users enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.comments enable row level security;
alter table public.tags enable row level security;
alter table public.task_tags enable row level security;

-- Volontairement aucune policy : le rôle "anon" (et "authenticated", non
-- utilisé ici) n'a donc accès à rien. Tout passe par le rôle service_role
-- côté serveur Next.js, qui contourne RLS.

-- Bootstrap : premier compte administrateur, mot de passe temporaire
-- "bonjour2026" (hash scrypt précalculé ci-dessous). À la première
-- connexion, l'application demandera de le remplacer par un mot de passe
-- personnel — voir README.md.
insert into public.users (name, password_hash, role, password_set)
values (
  'Admin',
  'eb1886974e0d692bf9207b2faec089da:724cfcf19d5c130193b5f4cbdea20ecf092a55eac7f7e2da2d89614b83ea0e6e749b3be802f3dfc7ef9e535732346de63375b8bad1cac3c6029e0223fecb41fc',
  'admin',
  false
);

-- Tags de départ proposés à la création d'une tâche (la liste s'enrichit
-- ensuite librement depuis le formulaire).
insert into public.tags (name) values
  ('maison'), ('enfants'), ('achats'), ('famille'), ('cadeaux'),
  ('vacances'), ('travaux'), ('impots'), ('factures')
on conflict (name) do nothing;

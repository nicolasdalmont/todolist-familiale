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
-- Ce script est un RESET complet : il supprime l'ancien schéma (basé sur
-- Supabase Auth + table "profiles") s'il existe, puis recrée tout depuis
-- zéro. À exécuter en une fois dans le SQL Editor de Supabase. Comme le
-- projet n'a pas encore de données réelles en production, ce reset ne perd
-- rien d'important — à adapter si ce n'est plus le cas.

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
  color text default '#6C5CE7',
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
  visibility text not null default 'shared'
    check (visibility in ('shared', 'private')),
  created_by uuid references public.users(id) not null,
  created_at timestamptz default now()
);

create table public.task_assignees (
  task_id uuid references public.tasks(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  primary key (task_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  author_id uuid references public.users(id) not null,
  body text not null,
  created_at timestamptz default now()
);

alter table public.users enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.comments enable row level security;

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

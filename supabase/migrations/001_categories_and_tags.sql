-- Migration additive (ne supprime rien) : ajoute la catégorie principale
-- des tâches ainsi qu'un système de tags libres. À exécuter une fois dans
-- le SQL Editor de Supabase, sur la base existante — contrairement à
-- un script de reset, ce script ne fait aucun "drop table" et préserve les
-- comptes et tâches déjà créés.

alter table public.tasks
  add column if not exists category text not null default 'autre'
    check (category in ('achats', 'autre', 'cadeaux', 'enfants', 'famille', 'maison', 'vacances'));

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

create table if not exists public.task_tags (
  task_id uuid references public.tasks(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

alter table public.tags enable row level security;
alter table public.task_tags enable row level security;
-- Volontairement aucune policy, comme le reste du schéma : l'accès passe
-- exclusivement par la clé service_role côté serveur Next.js.

-- Tags de départ proposés à la création d'une tâche (la liste s'enrichit
-- ensuite librement depuis le formulaire, sans repasser par le SQL Editor).
insert into public.tags (name) values
  ('maison'), ('enfants'), ('achats'), ('famille'), ('cadeaux'),
  ('vacances'), ('travaux'), ('impots'), ('factures')
on conflict (name) do nothing;

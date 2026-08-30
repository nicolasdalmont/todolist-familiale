-- Schéma de référence pour le projet Supabase de la To-Do List Familiale.
-- Ce script a normalement déjà été exécuté manuellement dans le SQL Editor
-- de Supabase (voir le guide de mise en route). Il est conservé ici comme
-- source de vérité versionnée, pour recréer la base ou la faire évoluer.

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  color text default '#6C5CE7',
  created_at timestamptz default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  due_at timestamptz,
  recurrence jsonb default '{"type":"none"}',
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'archived')),
  visibility text not null default 'shared'
    check (visibility in ('shared', 'private')),
  created_by uuid references public.profiles(id) not null,
  created_at timestamptz default now()
);

create table if not exists public.task_assignees (
  task_id uuid references public.tasks(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (task_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  author_id uuid references public.profiles(id) not null,
  body text not null,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.comments enable row level security;

create policy "lecture des profils" on public.profiles
  for select using (true);

create policy "lecture des tâches visibles" on public.tasks
  for select using (visibility = 'shared' or created_by = auth.uid());

create policy "création de ses propres tâches" on public.tasks
  for insert with check (created_by = auth.uid());

create policy "modification des tâches visibles" on public.tasks
  for update using (visibility = 'shared' or created_by = auth.uid());

create policy "lecture des assignations" on public.task_assignees
  for select using (true);

create policy "gestion des assignations sur tâches visibles" on public.task_assignees
  for all using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and (t.visibility = 'shared' or t.created_by = auth.uid())
    )
  );

create policy "lecture des commentaires sur tâches visibles" on public.comments
  for select using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and (t.visibility = 'shared' or t.created_by = auth.uid())
    )
  );

create policy "ajout de ses propres commentaires" on public.comments
  for insert with check (author_id = auth.uid());

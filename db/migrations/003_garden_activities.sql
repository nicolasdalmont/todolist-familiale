-- Migration 003 — activités récurrentes du jardin (voir src/lib/garden.ts).
--
-- À exécuter à la main sur le projet Neon (SQL Editor du dashboard, ou
--   psql "$NEON_DIRECT_URL" -f db/migrations/003_garden_activities.sql).
--
-- Une activité de jardin (garden_activities) est une définition récurrente
-- distincte des tâches : un nom, une description, un ensemble de mois de
-- l'année (`months`, ex. {3,10} pour "mars et octobre") et un ou plusieurs
-- responsables (garden_activity_assignees, many-to-many comme
-- task_assignees). Contrairement à la récurrence des tâches
-- (daily/weekly/monthly/yearly/custom, colonne tasks.recurrence), une
-- activité de jardin ne récurre pas à intervalle fixe mais sur un ensemble
-- de périodes précises — d'où un modèle séparé plutôt qu'une variante de
-- Recurrence.
--
-- Chaque activité n'a jamais plus d'une tâche "ouverte" à la fois
-- (index unique partiel ci-dessous) : sa clôture ou sa suppression
-- (src/lib/actions.ts, setStatusAction/deleteTaskAction) déclenche la
-- création de la tâche de la période suivante via
-- src/lib/garden.ts::advanceGardenActivity(). garden_occurrence_month/year
-- retiennent la période représentée par la tâche, pour calculer la
-- suivante sans avoir à la redéduire de due_at.

create table if not exists public.garden_activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  -- Mois de l'année (1-12), au moins un, sans doublon — validé côté
  -- application (src/lib/garden-actions.ts), comme le slug de catégorie.
  months smallint[] not null check (array_length(months, 1) > 0),
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.garden_activity_assignees (
  garden_activity_id uuid not null references public.garden_activities(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key (garden_activity_id, user_id)
);

-- "on delete set null" plutôt que cascade : si l'activité est supprimée,
-- la tâche déjà clôturée qui lui était liée reste dans l'historique (juste
-- dépouillée de son origine Jardin) — seule sa tâche encore ouverte, elle,
-- est explicitement supprimée par deleteGardenActivityAction avant de
-- supprimer l'activité.
alter table public.tasks add column if not exists garden_activity_id uuid references public.garden_activities(id) on delete set null;
alter table public.tasks add column if not exists garden_occurrence_month smallint;
alter table public.tasks add column if not exists garden_occurrence_year int;

create unique index if not exists tasks_garden_open_occurrence_uidx
  on public.tasks(garden_activity_id)
  where garden_activity_id is not null and status not in ('done', 'archived');

-- Catégorie dédiée pour les tâches générées, afin qu'elles s'affichent et
-- se filtrent comme les autres dans l'onglet Tâches.
insert into public.categories (slug, label, icon, position) values ('jardin', 'Jardin', 'leaf', 7)
on conflict (slug) do nothing;

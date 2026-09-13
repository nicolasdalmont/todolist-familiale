-- Migration 008 — activités récurrentes de finances (voir src/lib/finances.ts).
--
-- À exécuter à la main sur le projet Neon (SQL Editor du dashboard, ou
--   psql "$NEON_DIRECT_URL" -f db/migrations/008_finances_activities.sql).
--
-- Même montage que car_activities (migration 005) et health_activities
-- (migration 007) : une activité finances est une instance datée à part
-- entière : nom, description, une date (jour+mois+année, ou mois+année si
-- le jour est inconnu — `day_known`), une récurrence par intervalle (même
-- type que tasks.recurrence, voir src/lib/types.ts::Recurrence) et un
-- statut. Sa clôture crée une NOUVELLE ligne (l'instance suivante),
-- calculée via computeNextOccurrence() (src/lib/format.ts) plutôt que
-- d'avancer un compteur sur la même ligne — voir
-- src/lib/finances.ts::advanceFinancesActivity().
--
-- La catégorie "finances" existe déjà (créée via l'écran admin Catégories,
-- icône générique "tag") : on la bascule ici sur une icône dédiée "euro"
-- (src/components/Icons.tsx, ajoutée à CATEGORY_ICON_CHOICES dans
-- src/lib/categories.ts) — même correction que la migration 006 pour
-- Voiture, mais faite en une seule migration avec `on conflict do update`
-- plutôt qu'une migration séparée, puisque la catégorie peut déjà exister.

create table if not exists public.finances_activities (
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

create table if not exists public.finances_activity_assignees (
  finances_activity_id uuid not null references public.finances_activities(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key (finances_activity_id, user_id)
);

alter table public.tasks add column if not exists finances_activity_id uuid references public.finances_activities(id) on delete set null;

create unique index if not exists tasks_finances_open_occurrence_uidx
  on public.tasks(finances_activity_id)
  where finances_activity_id is not null and status not in ('done', 'archived');

insert into public.categories (slug, label, icon, position) values ('finances', 'Finances', 'euro', 4)
on conflict (slug) do update set icon = 'euro';

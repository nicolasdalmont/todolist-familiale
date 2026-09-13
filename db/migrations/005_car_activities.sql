-- Migration 005 — activités récurrentes de la voiture (voir src/lib/car.ts).
--
-- À exécuter à la main sur le projet Neon (SQL Editor du dashboard, ou
--   psql "$NEON_DIRECT_URL" -f db/migrations/005_car_activities.sql).
--
-- Contrairement à garden_activities (migration 003, un ensemble de mois
-- récurrent porté par une ligne persistante), une activité voiture est une
-- instance datée à part entière : nom, description, une date (jour+mois+
-- année, ou mois+année si le jour est inconnu — `day_known`), une
-- récurrence par intervalle (même type que tasks.recurrence, voir
-- src/lib/types.ts::Recurrence) et un statut. Sa clôture crée une NOUVELLE
-- ligne (l'instance suivante), calculée via computeNextOccurrence()
-- (src/lib/format.ts, déjà utilisé pour la récurrence générique des
-- tâches) plutôt que d'avancer un compteur sur la même ligne — voir
-- src/lib/car.ts::advanceCarActivity().

create table if not exists public.car_activities (
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

create table if not exists public.car_activity_assignees (
  car_activity_id uuid not null references public.car_activities(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key (car_activity_id, user_id)
);

alter table public.tasks add column if not exists car_activity_id uuid references public.car_activities(id) on delete set null;

create unique index if not exists tasks_car_open_occurrence_uidx
  on public.tasks(car_activity_id)
  where car_activity_id is not null and status not in ('done', 'archived');

insert into public.categories (slug, label, icon, position) values ('voiture', 'Voiture', 'wrench', 8)
on conflict (slug) do nothing;

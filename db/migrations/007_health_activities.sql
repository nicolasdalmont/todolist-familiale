-- Migration 007 — activités récurrentes de santé (voir src/lib/health.ts).
--
-- À exécuter à la main sur le projet Neon (SQL Editor du dashboard, ou
--   psql "$NEON_DIRECT_URL" -f db/migrations/007_health_activities.sql).
--
-- Même montage que car_activities (migration 005) : une activité santé est
-- une instance datée à part entière : nom, description, une date (jour+
-- mois+année, ou mois+année si le jour est inconnu — `day_known`), une
-- récurrence par intervalle (même type que tasks.recurrence, voir
-- src/lib/types.ts::Recurrence) et un statut. Sa clôture crée une NOUVELLE
-- ligne (l'instance suivante), calculée via computeNextOccurrence()
-- (src/lib/format.ts) plutôt que d'avancer un compteur sur la même ligne —
-- voir src/lib/health.ts::advanceHealthActivity().
--
-- Contrairement à Voiture, l'icône dédiée ("heart") existe déjà dans
-- CATEGORY_ICON_CHOICES (src/lib/categories.ts) : pas de migration de
-- correction d'icône nécessaire ici (cf. migration 006 pour Voiture).

create table if not exists public.health_activities (
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

create table if not exists public.health_activity_assignees (
  health_activity_id uuid not null references public.health_activities(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key (health_activity_id, user_id)
);

alter table public.tasks add column if not exists health_activity_id uuid references public.health_activities(id) on delete set null;

create unique index if not exists tasks_health_open_occurrence_uidx
  on public.tasks(health_activity_id)
  where health_activity_id is not null and status not in ('done', 'archived');

insert into public.categories (slug, label, icon, position) values ('sante', 'Santé', 'heart', 9)
on conflict (slug) do nothing;

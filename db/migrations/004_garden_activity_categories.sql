-- Migration 004 — catégories des activités de jardin (voir
-- src/lib/garden-categories.ts).
--
-- À exécuter à la main sur le projet Neon (SQL Editor du dashboard, ou
--   psql "$NEON_DIRECT_URL" -f db/migrations/004_garden_activity_categories.sql).
--
-- Axe de classement séparé des catégories de tâches (table `categories`,
-- migration 009) : une activité de jardin est "Taille"/"Semis"/
-- "Plantation"/"Autre", indépendamment de la catégorie "Jardin" unique que
-- porte la tâche générée dans l'onglet Tâches (voir src/lib/garden.ts,
-- GARDEN_CATEGORY_SLUG). Même forme (slug/label/icon/position) et mêmes
-- icônes que `categories` — voir CATEGORY_ICON_CHOICES dans
-- src/lib/categories.ts, réutilisé tel quel.

create table if not exists public.garden_activity_categories (
  slug text primary key,
  label text not null,
  icon text not null default 'dots',
  position int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.garden_activity_categories (slug, label, icon, position) values
  ('taille',     'Taille',     'wrench', 0),
  ('semis',      'Semis',      'leaf',   1),
  ('plantation', 'Plantation', 'sun',    2),
  ('autre',      'Autre',      'dots',   3)
on conflict (slug) do nothing;

-- "not null default 'autre'" : les activités déjà créées (avant cette
-- migration) sont rétroactivement classées "Autre".
alter table public.garden_activities add column if not exists category text not null default 'autre';

alter table public.garden_activities
  add constraint garden_activities_category_fkey
  foreign key (category) references public.garden_activity_categories(slug) on delete restrict;

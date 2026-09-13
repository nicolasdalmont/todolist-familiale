-- Migration 009 — activation/désactivation individuelle des 4 agendas
-- (Jardin/Voiture/Santé/Finances) depuis l'admin.
--
-- À exécuter à la main sur le projet Neon (SQL Editor du dashboard, ou
--   psql "$NEON_DIRECT_URL" -f db/migrations/009_agenda_toggles.sql).
--
-- Même montage que reminder_enabled (table `app_settings`, une ligne
-- id=1) : quatre colonnes booléennes plutôt qu'une table séparée, pour un
-- réglage aussi simple qu'un rappel activé/désactivé. Voir
-- src/lib/agendas.ts pour le registre associant chaque agenda à sa colonne,
-- et getTasks() (src/lib/queries.ts) pour le filtrage des tâches d'un
-- agenda désactivé — les activités et tâches liées restent en base, elles
-- ne sont simplement plus renvoyées tant que l'agenda est désactivé.

alter table public.app_settings add column if not exists jardin_enabled boolean not null default true;
alter table public.app_settings add column if not exists voiture_enabled boolean not null default true;
alter table public.app_settings add column if not exists sante_enabled boolean not null default true;
alter table public.app_settings add column if not exists finances_enabled boolean not null default true;

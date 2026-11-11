-- Migration 012 — suppression du statut « Archivée » + purge des tâches
-- terminées après 3 mois (cron /api/cron/purge, voir vercel.json).
--
-- * tasks.completed_at : date de passage à « Terminée » (posée/effacée par
--   setStatusAction / updateTaskAction). La purge s'appuie dessus.
-- * Les tâches déjà terminées reçoivent completed_at = maintenant : elles
--   bénéficient de 3 mois de sursis à partir du déploiement.
-- * Les tâches « archived » existantes deviennent « done » (mêmes 3 mois).
--
-- À exécuter à la main sur le projet Neon (SQL Editor du dashboard, ou
--   psql "$NEON_DIRECT_URL" -f db/migrations/012_purge_done_tasks.sql),
-- AVANT de déployer le code correspondant.

alter table public.tasks add column if not exists completed_at timestamptz;

update public.tasks set status = 'done' where status = 'archived';
update public.tasks set completed_at = now() where status = 'done' and completed_at is null;

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks
  add constraint tasks_status_check check (status in ('todo', 'in_progress', 'done'));

create index if not exists tasks_completed_at_idx
  on public.tasks (completed_at) where completed_at is not null;

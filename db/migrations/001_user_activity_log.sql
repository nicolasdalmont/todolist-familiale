-- Migration 001 — table user_activity_log (streak personnel, voir
-- src/lib/streaks.ts).
--
-- À exécuter à la main sur le projet Neon (SQL Editor du dashboard, ou
--   psql "$NEON_DIRECT_URL" -f db/migrations/001_user_activity_log.sql).
--
-- Table volontairement minimale : pas de référence de tâche, pas de type
-- ni de détail — seulement "cet utilisateur a fait quelque chose de
-- qualifiant ce jour-là". Alimentée pour TOUTE tâche (privée ou
-- partagée), contrairement à activity_log (jamais pour une tâche privée,
-- voir logActivity() dans src/lib/actions.ts) : ne stocker aucun contenu
-- de tâche ici évite toute fuite vers le reste de la famille, même si
-- cette table venait un jour à être affichée quelque part.

create table if not exists public.user_activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists user_activity_log_user_id_idx
  on public.user_activity_log(user_id, created_at desc);

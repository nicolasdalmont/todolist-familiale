-- Migration 010 — boîte à idées (onglet Idées, voir src/lib/ideas-queries.ts
-- et src/lib/ideas-actions.ts).
--
-- À exécuter à la main sur le projet Neon (SQL Editor du dashboard, ou
--   psql "$NEON_DIRECT_URL" -f db/migrations/010_ideas.sql).
--
-- Même principe que la fonctionnalité équivalente sur mabedetheque (autre
-- projet de l'utilisateur) : une suggestion d'amélioration en texte libre,
-- avec un statut de suivi. Adapté ici au modèle multi-utilisateur familial
-- (pas de owner_id/RLS mono-utilisateur : toute la famille voit et fait
-- avancer toutes les idées, comme pour les tâches).
create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  status text not null default 'created'
    check (status in ('created', 'processed', 'done')),
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ideas_status_idx on public.ideas(status);
create index if not exists ideas_created_by_idx on public.ideas(created_by);

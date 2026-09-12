-- Migration 002 — paliers de récompense (voir src/lib/rewards.ts).
--
-- À exécuter à la main sur le projet Neon (SQL Editor du dashboard, ou
--   psql "$NEON_DIRECT_URL" -f db/migrations/002_reward_tiers.sql).
--
-- Un palier (reward_tiers) est configuré par l'admin : portée individuelle
-- (streak personnel) ou collective (défis familiaux réussis cumulés), un
-- seuil, et un libellé de récompense en texte libre — la récompense elle-même
-- (sortie, argent de poche...) est négociée en famille, hors appli.
--
-- challenge_results fige le résultat d'une semaine de défi une fois
-- celle-ci terminée (voir settleEndedChallengeWeeks() dans
-- src/lib/rewards.ts) : permet de compter les défis réussis cumulés sans
-- recalculer indéfiniment le passé à partir d'activity_log.

create table if not exists public.reward_tiers (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('individual', 'collective')),
  metric text not null check (metric in ('streak_days', 'challenges_completed')),
  threshold int not null check (threshold > 0),
  reward_label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_results (
  week_start date primary key,
  success boolean not null,
  computed_at timestamptz not null default now()
);

create table if not exists public.reward_achievements (
  id uuid primary key default gen_random_uuid(),
  tier_id uuid not null references public.reward_tiers(id) on delete cascade,
  -- null pour un palier collectif (toute la famille) ; renseigné pour un
  -- palier individuel. Deux index uniques partiels ci-dessous au lieu d'une
  -- contrainte unique(tier_id, user_id) : Postgres ne considère pas deux
  -- NULL comme égaux, une contrainte simple laisserait passer des doublons
  -- collectifs.
  user_id uuid references public.users(id) on delete cascade,
  achieved_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'given')),
  given_at timestamptz,
  given_by uuid references public.users(id) on delete set null
);

create unique index if not exists reward_achievements_individual_uidx
  on public.reward_achievements(tier_id, user_id) where user_id is not null;
create unique index if not exists reward_achievements_collective_uidx
  on public.reward_achievements(tier_id) where user_id is null;

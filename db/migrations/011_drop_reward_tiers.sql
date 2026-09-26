-- Migration 011 — suppression des défis familiaux et des paliers de
-- récompense (fonctionnalités retirées, voir doc technique §6.17/§6.18) :
-- le streak personnel (table user_activity_log, migration 001) est
-- conservé tel quel, seules les tables introduites par la migration 002
-- disparaissent.
--
-- À exécuter à la main sur le projet Neon (SQL Editor du dashboard, ou
--   psql "$NEON_DIRECT_URL" -f db/migrations/011_drop_reward_tiers.sql).

drop table if exists public.reward_achievements cascade;
drop table if exists public.challenge_results cascade;
drop table if exists public.reward_tiers cascade;

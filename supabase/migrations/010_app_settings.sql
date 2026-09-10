-- Migration additive : réglages d'instance modifiables depuis l'écran
-- admin (onglet « Réglages » — voir src/components/SettingsPanel.tsx et
-- src/lib/settings-actions.ts).
--
-- Une seule ligne (id = 1). Pour l'instant : l'activation du rappel
-- d'échéance quotidien. Le nom de l'appli, le fuseau horaire et l'heure
-- du rappel restent hors base : les deux premiers sont des variables
-- d'environnement (NEXT_PUBLIC_APP_NAME / NEXT_PUBLIC_APP_TIMEZONE, connus
-- au build) ; l'heure du rappel est le `schedule` du cron dans
-- vercel.json (Vercel Hobby limite le cron à un déclenchement par jour,
-- on ne peut donc pas la piloter depuis la base).

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  -- Le cron /api/cron/reminders (voir vercel.json) ne fait rien si false.
  reminder_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
-- Aucune policy : accès via service_role côté serveur uniquement.

-- Migration additive : abonnements aux notifications push web (un par
-- appareil/navigateur où l'utilisateur a activé les notifications — voir
-- l'écran "Mon compte", src/app/compte/page.tsx). Alimentée par le flux
-- d'abonnement côté client (pushManager.subscribe()) et consommée par
-- sendPushToUser() (src/lib/push.ts), appelé depuis notifyUser()
-- (src/lib/notifications.ts) à chaque notification "À ton attention".
--
-- Opt-in strict, par appareil : aucune ligne tant que la personne n'a pas
-- explicitement cliqué "Activer les notifications" sur cet appareil précis
-- (voir la feuille de route notifications, aucune notification par défaut).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- URL unique fournie par le navigateur (pushManager.subscribe()) :
  -- identifie l'abonnement, sert de clé de dé-duplication si la même
  -- personne active les notifications deux fois sur le même appareil.
  endpoint text not null unique,
  -- Clés de chiffrement du payload (protocole Web Push, RFC 8291),
  -- fournies par le navigateur au moment de l'abonnement.
  p256dh text not null,
  auth text not null,
  -- Informatif uniquement (aide au diagnostic depuis l'écran admin plus
  -- tard, ex. "iPhone de Nicolas") ; jamais utilisé pour l'envoi.
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
-- Volontairement aucune policy, comme le reste du schéma : tout passe par
-- le rôle service_role côté serveur Next.js.

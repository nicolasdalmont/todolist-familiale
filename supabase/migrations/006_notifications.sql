-- Migration additive : notifications « À ton attention » par utilisateur.
-- Alimente le fil affiché sous les compteurs de l'écran d'accueil
-- (src/components/AttentionFeed.tsx). Écrites par notifyUser() /
-- notifyTaskParticipants() (src/lib/notifications.ts) en même temps que
-- l'action qui les provoque (commentaire, partage d'une tâche, changement
-- de statut), de façon non bloquante — une erreur d'écriture ne doit
-- jamais faire échouer l'action principale.
--
-- À terme, la même écriture déclenchera aussi un push web (voir la feuille
-- de route notifications).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- Clé de gabarit / icône côté client :
  -- "task_shared" | "comment_added" | "status_changed" | "due_soon".
  type text not null,
  -- Tâche concernée, pour le lien vers /tasks/[id]. NULL possible pour un
  -- type sans tâche. on delete cascade : la notif disparaît avec la tâche.
  task_id uuid references public.tasks(id) on delete cascade,
  -- Phrase prête à afficher (« Virgile a commenté … »).
  title text not null,
  -- Détail secondaire optionnel (extrait de commentaire, etc.).
  body text,
  -- NULL tant que non lue ; horodatée au clic « Tout marquer comme lu ».
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
-- Volontairement aucune policy, comme le reste du schéma : tout passe par
-- le rôle service_role côté serveur Next.js.

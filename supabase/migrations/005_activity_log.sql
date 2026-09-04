-- Migration additive : journal d'activité des tâches partagées, utilisé
-- pour alimenter le fil "Activité du jour" de l'écran d'accueil (voir
-- src/components/ActivityFeed.tsx). Trace les actions qui ont un intérêt
-- pour les autres personnes ayant accès à la tâche : création d'une tâche
-- partagée, modification, changement de statut, commentaire (ajout/
-- suppression), item de checklist (ajout/coché-décoché/suppression).
--
-- task_title est dénormalisé (recopié au moment de l'action) plutôt que
-- résolu par une jointure à la lecture : si la tâche est supprimée entre
-- temps, la ligne d'activité disparaît de toute façon (on delete cascade),
-- donc ce n'est pas une protection contre ça, mais ça évite une jointure
-- supplémentaire pour un fil qui n'affiche que les dernières 24-48h.
--
-- Écriture volontairement tolérante aux pannes côté application
-- (src/lib/actions.ts, fonction logActivity) : si cette table n'existe pas
-- encore le temps que cette migration soit appliquée, les actions
-- principales (créer/modifier une tâche, commenter, etc.) doivent quand
-- même réussir.

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  type text not null,
  task_title text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_task_id_idx on public.activity_log(task_id);
create index if not exists activity_log_created_at_idx on public.activity_log(created_at);

alter table public.activity_log enable row level security;
-- Volontairement aucune policy, comme le reste du schéma (voir
-- recreate_full_schema.sql) :
-- tout passe par le rôle service_role côté serveur Next.js.

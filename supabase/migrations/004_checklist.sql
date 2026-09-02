-- Migration additive : ajoute une checklist (sous-tâches à cocher) au sein
-- d'une tâche. Gérée directement depuis l'écran de détail (ajout, coche,
-- suppression d'un item) — voir src/components/ChecklistSection.tsx et les
-- actions correspondantes dans src/lib/actions.ts — pas depuis le
-- formulaire de création/modification. Les mêmes règles d'accès que le
-- reste de la tâche s'appliquent : "canEdit" pour ajouter/cocher/supprimer
-- un item, "canView" suffit pour la consulter (voir src/lib/access.ts).
--
-- Un item n'a pas de colonne d'ordre dédiée : l'ordre d'affichage suit la
-- date de création (created_at), suffisant pour une checklist qu'on
-- construit au fil de l'eau et sans besoin de réordonnancement manuel.

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  created_at timestamptz default now()
);

alter table public.checklist_items enable row level security;

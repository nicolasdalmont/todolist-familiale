-- Migration additive : remplace le champ "Visibilité" choisi manuellement
-- par un partage explicite, personne par personne, avec un rôle par
-- partage :
--   - "editor"  : peut voir, modifier et changer le statut de la tâche
--     (comportement des "assignés" actuels) — c'est le rôle par défaut.
--   - "viewer"  : peut seulement voir la tâche et commenter, pas la
--     modifier.
-- Le créateur d'une tâche est toujours "editor" (imposé côté application,
-- voir src/lib/actions.ts). La visibilité ("shared"/"private") n'est plus
-- saisie par l'utilisateur : elle est recalculée automatiquement par
-- l'application à chaque création/modification, à partir du partage
-- effectif (privée = personne d'autre que le créateur n'a accès).
--
-- Cette migration recalcule aussi la visibilité de toutes les tâches
-- existantes à partir de leur partage actuel, pour repartir sur une base
-- cohérente.

alter table public.task_assignees
  add column if not exists role text not null default 'editor'
    check (role in ('editor', 'viewer'));

update public.tasks t
set visibility = case
  when exists (
    select 1 from public.task_assignees ta
    where ta.task_id = t.id and ta.user_id <> t.created_by
  ) then 'shared'
  else 'private'
end;

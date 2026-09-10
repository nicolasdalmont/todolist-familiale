-- Migration additive : rend possible la suppression d'un compte depuis
-- l'écran d'administration (onglet « Membres » — voir
-- src/components/UserManager.tsx et src/lib/admin-actions.ts).
--
-- Les clés étrangères tasks.created_by et comments.author_id étaient en
-- ON DELETE NO ACTION (défaut) : supprimer un utilisateur qui a créé au
-- moins une tâche ou laissé un commentaire échouait. On les passe en
-- ON DELETE CASCADE — supprimer un membre supprime alors les tâches
-- qu'il a créées (et, en cascade déjà en place, leurs assigné(e)s,
-- commentaires, tags, checklist, activité et notifications) ainsi que
-- ses commentaires laissés ailleurs.
--
-- deleteMemberAction() fait aussi ce ménage explicitement, pour rester
-- correct même si cette migration n'a pas encore été appliquée ; les deux
-- approches sont cohérentes.

alter table public.tasks drop constraint if exists tasks_created_by_fkey;
alter table public.tasks
  add constraint tasks_created_by_fkey
  foreign key (created_by) references public.users(id) on delete cascade;

alter table public.comments drop constraint if exists comments_author_id_fkey;
alter table public.comments
  add constraint comments_author_id_fkey
  foreign key (author_id) references public.users(id) on delete cascade;

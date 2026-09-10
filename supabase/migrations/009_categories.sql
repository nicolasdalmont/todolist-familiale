-- Migration additive : catégories de tâches gérables depuis l'écran
-- d'administration (onglet « Catégories » — voir
-- src/components/CategoryManager.tsx et src/lib/category-actions.ts).
--
-- Jusqu'ici la liste des catégories était figée en dur (src/lib/
-- categories.ts) et verrouillée par une contrainte CHECK sur
-- tasks.category. On la déplace en base pour qu'un déploiement puisse
-- l'adapter (renommer, ajouter, supprimer, réordonner) sans toucher au
-- code.

create table if not exists public.categories (
  -- Clé stable stockée dans tasks.category ; dérivée du libellé à la
  -- création, jamais modifiée ensuite (seul le libellé est éditable).
  slug text primary key,
  label text not null,
  -- Nom d'icône choisi parmi CATEGORY_ICON_CHOICES (src/lib/categories.ts).
  icon text not null default 'dots',
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Reprend telles quelles les 7 catégories historiques.
insert into public.categories (slug, label, icon, position) values
  ('achats',   'Achats',   'shopping', 0),
  ('autre',    'Autre',    'dots',     1),
  ('cadeaux',  'Cadeaux',  'gift',     2),
  ('enfants',  'Enfants',  'baby',     3),
  ('famille',  'Famille',  'users',    4),
  ('maison',   'Maison',   'home',     5),
  ('vacances', 'Vacances', 'sun',      6)
on conflict (slug) do nothing;

-- Retire toute contrainte CHECK figée portant sur tasks.category
-- (nom par défaut probable : tasks_category_check, mais on ne s'y fie pas).
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.tasks'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.tasks drop constraint %I', c);
  end loop;
end $$;

-- FK vers la nouvelle table : toutes les valeurs existantes de
-- tasks.category correspondent aux 7 lignes ci-dessus. « on delete
-- restrict » : supprimer une catégorie encore utilisée est bloqué en
-- base — deleteCategoryAction réaffecte d'abord les tâches concernées à
-- « autre ».
alter table public.tasks drop constraint if exists tasks_category_fkey;
alter table public.tasks
  add constraint tasks_category_fkey
  foreign key (category) references public.categories(slug) on delete restrict;

alter table public.categories enable row level security;
-- Aucune policy, comme le reste du schéma : accès via service_role côté
-- serveur uniquement.

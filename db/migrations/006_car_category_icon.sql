-- Migration 006 — icône dédiée pour la catégorie de tâche "Voiture".
--
-- À exécuter à la main sur le projet Neon (SQL Editor du dashboard, ou
--   psql "$NEON_DIRECT_URL" -f db/migrations/006_car_category_icon.sql).
--
-- La migration 005 avait semé la catégorie "voiture" avec l'icône
-- "wrench" (générique, partagée avec une catégorie d'activité de jardin) —
-- on la bascule sur l'icône "car" dédiée (src/components/Icons.tsx,
-- ajoutée à CATEGORY_ICON_CHOICES dans src/lib/categories.ts).

update public.categories set icon = 'car' where slug = 'voiture';

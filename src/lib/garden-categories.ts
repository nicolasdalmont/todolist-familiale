import type { Category } from "./types";

// Catégories des activités de jardin (table `garden_activity_categories`,
// migration 004) — axe de classement séparé des catégories de tâches
// (src/lib/categories.ts) : une activité de jardin est "Taille"/"Semis"/
// "Plantation"/"Autre", indépendamment de la catégorie "Jardin" unique que
// porte la tâche générée dans l'onglet Tâches (voir src/lib/garden.ts,
// GARDEN_CATEGORY_SLUG). Même forme (slug/label/icon/position) que
// Category : CATEGORY_ICON_CHOICES, categoryIcon/categoryIconColor/
// categoryBgColor et resolveCategory (src/lib/categories.ts) sont
// réutilisés tels quels, pas besoin de les dupliquer.

export const FALLBACK_GARDEN_CATEGORY_SLUG = "autre";

// Catégories historiques — servent de repli si la table
// `garden_activity_categories` n'existe pas encore (migration 004 pas
// appliquée) : l'appli reste fonctionnelle le temps que la migration soit
// jouée. Voir getGardenActivityCategories() dans src/lib/garden-queries.ts.
export const DEFAULT_GARDEN_CATEGORIES: Category[] = [
  { slug: "taille", label: "Taille", icon: "wrench", position: 0 },
  { slug: "semis", label: "Semis", icon: "leaf", position: 1 },
  { slug: "plantation", label: "Plantation", icon: "sun", position: 2 },
  { slug: "autre", label: "Autre", icon: "dots", position: 3 },
];

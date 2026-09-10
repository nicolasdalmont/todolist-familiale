import type { ComponentType } from "react";
import type { Category } from "./types";
import {
  IconBaby,
  IconCalendar,
  IconChat,
  IconChecklist,
  IconDots,
  IconGift,
  IconHome,
  IconRepeat,
  IconShoppingBag,
  IconSun,
  IconTag,
  IconUser,
  IconUsers,
} from "@/components/Icons";

type IconCmp = ComponentType<{ className?: string }>;

// Jeu d'icônes sélectionnables pour une catégorie (écran admin →
// « Catégories »). La clé (`name`) est stockée dans `categories.icon`.
export const CATEGORY_ICON_CHOICES: { name: string; Icon: IconCmp }[] = [
  { name: "dots", Icon: IconDots },
  { name: "home", Icon: IconHome },
  { name: "shopping", Icon: IconShoppingBag },
  { name: "gift", Icon: IconGift },
  { name: "baby", Icon: IconBaby },
  { name: "users", Icon: IconUsers },
  { name: "user", Icon: IconUser },
  { name: "sun", Icon: IconSun },
  { name: "calendar", Icon: IconCalendar },
  { name: "checklist", Icon: IconChecklist },
  { name: "chat", Icon: IconChat },
  { name: "repeat", Icon: IconRepeat },
  { name: "tag", Icon: IconTag },
];

const ICON_BY_NAME = new Map(CATEGORY_ICON_CHOICES.map((c) => [c.name, c.Icon]));

export function categoryIcon(name: string): IconCmp {
  return ICON_BY_NAME.get(name) ?? IconDots;
}

// Catégorie fourre-tout : toujours présente (semée par la migration 009),
// jamais supprimable, cible de repli pour une tâche dont la catégorie a
// disparu.
export const FALLBACK_CATEGORY_SLUG = "autre";

// Catégories historiques — servent de repli si la table `categories`
// n'existe pas encore (migration 009 pas appliquée) : l'appli reste
// fonctionnelle le temps que la migration soit jouée. Voir
// getCategories() dans src/lib/queries.ts.
export const DEFAULT_CATEGORIES: Category[] = [
  { slug: "achats", label: "Achats", icon: "shopping", position: 0 },
  { slug: "autre", label: "Autre", icon: "dots", position: 1 },
  { slug: "cadeaux", label: "Cadeaux", icon: "gift", position: 2 },
  { slug: "enfants", label: "Enfants", icon: "baby", position: 3 },
  { slug: "famille", label: "Famille", icon: "users", position: 4 },
  { slug: "maison", label: "Maison", icon: "home", position: 5 },
  { slug: "vacances", label: "Vacances", icon: "sun", position: 6 },
];

// Résout le slug de catégorie d'une tâche contre la liste chargée depuis
// la base ; repli lisible si le slug n'existe plus (catégorie supprimée
// hors du flux normal, ou donnée incohérente).
export function resolveCategory(slug: string, categories: Category[]): Category {
  const found = categories.find((c) => c.slug === slug);
  if (found) return found;
  const fallback = categories.find((c) => c.slug === FALLBACK_CATEGORY_SLUG);
  return { slug, label: fallback?.label ?? "Autre", icon: fallback?.icon ?? "dots", position: 999 };
}

// slug ASCII à partir d'un libellé saisi (création d'une catégorie).
export function slugifyCategory(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

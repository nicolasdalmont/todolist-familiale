import type { ComponentType } from "react";
import type { Category } from "./types";
import {
  IconBaby,
  IconCalendar,
  IconChat,
  IconChecklist,
  IconDots,
  IconGift,
  IconHeart,
  IconHome,
  IconLeaf,
  IconRepeat,
  IconShoppingBag,
  IconSun,
  IconTag,
  IconUser,
  IconUsers,
  IconWrench,
} from "@/components/Icons";

type IconCmp = ComponentType<{ className?: string }>;

// Jeu d'icônes sélectionnables pour une catégorie (écran admin →
// « Catégories »). La clé (`name`) est stockée dans `categories.icon`.
// `color` distingue visuellement les icônes entre elles (badge de
// catégorie, sélecteur) — classe Tailwind `text-*`, écrite en toutes
// lettres pour que le scan de contenu Tailwind la détecte.
export const CATEGORY_ICON_CHOICES: { name: string; Icon: IconCmp; color: string }[] = [
  { name: "dots", Icon: IconDots, color: "text-slate-500" },
  { name: "home", Icon: IconHome, color: "text-amber-600" },
  { name: "shopping", Icon: IconShoppingBag, color: "text-blue-600" },
  { name: "gift", Icon: IconGift, color: "text-rose-600" },
  { name: "baby", Icon: IconBaby, color: "text-sky-600" },
  { name: "users", Icon: IconUsers, color: "text-violet-600" },
  { name: "user", Icon: IconUser, color: "text-indigo-600" },
  { name: "sun", Icon: IconSun, color: "text-yellow-600" },
  { name: "calendar", Icon: IconCalendar, color: "text-red-600" },
  { name: "checklist", Icon: IconChecklist, color: "text-teal-600" },
  { name: "chat", Icon: IconChat, color: "text-cyan-600" },
  { name: "repeat", Icon: IconRepeat, color: "text-orange-600" },
  { name: "tag", Icon: IconTag, color: "text-fuchsia-600" },
  { name: "leaf", Icon: IconLeaf, color: "text-green-600" },
  { name: "heart", Icon: IconHeart, color: "text-pink-600" },
  { name: "wrench", Icon: IconWrench, color: "text-stone-600" },
];

const ICON_BY_NAME = new Map(CATEGORY_ICON_CHOICES.map((c) => [c.name, c.Icon]));
const COLOR_BY_NAME = new Map(CATEGORY_ICON_CHOICES.map((c) => [c.name, c.color]));

export function categoryIcon(name: string): IconCmp {
  return ICON_BY_NAME.get(name) ?? IconDots;
}

// Couleur associée à une icône de catégorie (classe Tailwind `text-*`) —
// utilisée partout où l'icône est affichée seule (badge, sélecteur).
export function categoryIconColor(name: string): string {
  return COLOR_BY_NAME.get(name) ?? "text-ink-muted";
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

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
// catégorie, sélecteur) — classe Tailwind `text-*`. `bg` est le fond pastel
// de la même teinte, utilisé pour l'étiquette de catégorie sur les tâches
// (l'icône y passe en noir/`text-ink`, voir categoryTagClasses ci-dessous).
// Classes écrites en toutes lettres pour que le scan de contenu Tailwind
// les détecte.
export const CATEGORY_ICON_CHOICES: { name: string; Icon: IconCmp; color: string; bg: string }[] = [
  { name: "dots", Icon: IconDots, color: "text-slate-500", bg: "bg-slate-100" },
  { name: "home", Icon: IconHome, color: "text-amber-600", bg: "bg-amber-100" },
  { name: "shopping", Icon: IconShoppingBag, color: "text-blue-600", bg: "bg-blue-100" },
  { name: "gift", Icon: IconGift, color: "text-rose-600", bg: "bg-rose-100" },
  { name: "baby", Icon: IconBaby, color: "text-sky-600", bg: "bg-sky-100" },
  { name: "users", Icon: IconUsers, color: "text-violet-600", bg: "bg-violet-100" },
  { name: "user", Icon: IconUser, color: "text-indigo-600", bg: "bg-indigo-100" },
  { name: "sun", Icon: IconSun, color: "text-yellow-600", bg: "bg-yellow-100" },
  { name: "calendar", Icon: IconCalendar, color: "text-red-600", bg: "bg-red-100" },
  { name: "checklist", Icon: IconChecklist, color: "text-teal-600", bg: "bg-teal-100" },
  { name: "chat", Icon: IconChat, color: "text-cyan-600", bg: "bg-cyan-100" },
  { name: "repeat", Icon: IconRepeat, color: "text-orange-600", bg: "bg-orange-100" },
  { name: "tag", Icon: IconTag, color: "text-fuchsia-600", bg: "bg-fuchsia-100" },
  { name: "leaf", Icon: IconLeaf, color: "text-green-600", bg: "bg-green-100" },
  { name: "heart", Icon: IconHeart, color: "text-pink-600", bg: "bg-pink-100" },
  { name: "wrench", Icon: IconWrench, color: "text-stone-600", bg: "bg-stone-100" },
];

const ICON_BY_NAME = new Map(CATEGORY_ICON_CHOICES.map((c) => [c.name, c.Icon]));
const COLOR_BY_NAME = new Map(CATEGORY_ICON_CHOICES.map((c) => [c.name, c.color]));
const BG_BY_NAME = new Map(CATEGORY_ICON_CHOICES.map((c) => [c.name, c.bg]));

export function categoryIcon(name: string): IconCmp {
  return ICON_BY_NAME.get(name) ?? IconDots;
}

// Couleur associée à une icône de catégorie (classe Tailwind `text-*`) —
// utilisée partout où l'icône est affichée seule (badge, sélecteur).
export function categoryIconColor(name: string): string {
  return COLOR_BY_NAME.get(name) ?? "text-ink-muted";
}

// Fond pastel associé à une icône de catégorie (classe Tailwind `bg-*`) —
// utilisé pour l'étiquette de catégorie sur les tâches (TaskCard, détail
// tâche) : toute l'étiquette prend la couleur, l'icône repasse en noir.
export function categoryBgColor(name: string): string {
  return BG_BY_NAME.get(name) ?? "bg-sand";
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

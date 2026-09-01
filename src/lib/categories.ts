import type { ComponentType } from "react";
import type { Category } from "./types";
import { IconBaby, IconDots, IconGift, IconHome, IconShoppingBag, IconSun, IconUsers } from "@/components/Icons";

// Ordre alphabétique, tel que demandé — utilisé pour l'affichage du select
// et des filtres.
export const CATEGORY_ORDER: Category[] = ["achats", "autre", "cadeaux", "enfants", "famille", "maison", "vacances"];

export const CATEGORY_LABELS: Record<Category, string> = {
  achats: "Achats",
  autre: "Autre",
  cadeaux: "Cadeaux",
  enfants: "Enfants",
  famille: "Famille",
  maison: "Maison",
  vacances: "Vacances",
};

export const CATEGORY_ICONS: Record<Category, ComponentType<{ className?: string }>> = {
  achats: IconShoppingBag,
  autre: IconDots,
  cadeaux: IconGift,
  enfants: IconBaby,
  famille: IconUsers,
  maison: IconHome,
  vacances: IconSun,
};

export const DEFAULT_CATEGORY: Category = "autre";

export function isCategory(value: string): value is Category {
  return (CATEGORY_ORDER as string[]).includes(value);
}

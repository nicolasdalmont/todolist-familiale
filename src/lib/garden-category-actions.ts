"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { CATEGORY_ICON_CHOICES, slugifyCategory } from "@/lib/categories";
import { FALLBACK_GARDEN_CATEGORY_SLUG } from "@/lib/garden-categories";

// Gestion des catégories d'activités de jardin — section dédiée de l'onglet
// « Catégories » de l'écran /admin (voir src/components/AdminScreen.tsx et
// src/components/GardenCategoryManager.tsx), distincte du bloc « Catégories
// de tâches » juste au-dessus (src/lib/category-actions.ts) : deux tables
// et deux jeux d'actions indépendants, réservés à l'admin comme le reste de
// l'écran. Les activités de jardin elles-mêmes restent gérables par tout
// utilisateur (src/lib/garden-actions.ts) — seule la définition des
// catégories qu'elles utilisent est passée côté admin.

type Result = { error?: string; ok?: boolean };

const ICON_NAMES = new Set(CATEGORY_ICON_CHOICES.map((c) => c.name));
const cleanIcon = (raw: unknown) => (ICON_NAMES.has(String(raw)) ? String(raw) : "dots");

function tableMissing(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "42P01";
}
const MIGRATION_MISSING = "Applique d'abord la migration 004_garden_activity_categories.sql sur Neon.";

// Les catégories de jardin apparaissent sur /admin (gestion) et /jardin
// (sélecteur du formulaire d'activité) — voir getGardenActivityCategories()
// dans src/lib/garden-queries.ts.
function revalidate() {
  revalidatePath("/admin");
  revalidatePath("/jardin");
}

export async function createGardenCategoryAction(formData: FormData): Promise<Result> {
  await requireAdmin();

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Indique un nom." };
  if (label.length > 24) return { error: "Ce nom est trop long." };

  const slug = slugifyCategory(label);
  if (!slug) return { error: "Ce nom ne donne aucun identifiant valide (essaie avec des lettres)." };

  let existing: { slug: string; position: number }[];
  try {
    existing = (await sql`select slug, position from garden_activity_categories`) as {
      slug: string;
      position: number;
    }[];
  } catch (e) {
    if (tableMissing(e)) return { error: MIGRATION_MISSING };
    throw e;
  }
  if (existing.some((c) => c.slug === slug)) {
    return { error: "Une catégorie très proche existe déjà." };
  }
  const nextPos = Math.max(0, ...existing.map((c) => c.position)) + 1;

  try {
    await sql`
      insert into garden_activity_categories (slug, label, icon, position)
      values (${slug}, ${label}, ${cleanIcon(formData.get("icon"))}, ${nextPos})
    `;
  } catch {
    return { error: "Impossible de créer la catégorie. Réessaie." };
  }

  revalidate();
  return { ok: true };
}

export async function updateGardenCategoryAction(
  slug: string,
  patch: { label?: string; icon?: string }
): Promise<Result> {
  await requireAdmin();
  if (!slug) return { error: "Catégorie introuvable." };

  const update: { label?: string; icon?: string } = {};
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (!label) return { error: "Indique un nom." };
    if (label.length > 24) return { error: "Ce nom est trop long." };
    update.label = label;
  }
  if (patch.icon !== undefined) update.icon = cleanIcon(patch.icon);
  if (Object.keys(update).length === 0) return { ok: true };

  try {
    await sql`
      update garden_activity_categories
      set label = coalesce(${update.label ?? null}, label), icon = coalesce(${update.icon ?? null}, icon)
      where slug = ${slug}
    `;
  } catch (e) {
    if (tableMissing(e)) return { error: MIGRATION_MISSING };
    return { error: "Impossible d'enregistrer. Réessaie." };
  }

  revalidate();
  return { ok: true };
}

export async function moveGardenCategoryAction(slug: string, direction: "up" | "down"): Promise<Result> {
  await requireAdmin();

  let list: { slug: string; position: number }[];
  try {
    list = (await sql`select slug, position from garden_activity_categories order by position`) as {
      slug: string;
      position: number;
    }[];
  } catch (e) {
    if (tableMissing(e)) return { error: MIGRATION_MISSING };
    throw e;
  }
  const i = list.findIndex((c) => c.slug === slug);
  if (i === -1) return { error: "Catégorie introuvable." };
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return { ok: true };

  const a = list[i];
  const b = list[j];
  await sql`update garden_activity_categories set position = ${b.position} where slug = ${a.slug}`;
  await sql`update garden_activity_categories set position = ${a.position} where slug = ${b.slug}`;

  revalidate();
  return { ok: true };
}

export async function deleteGardenCategoryAction(slug: string): Promise<Result> {
  await requireAdmin();
  if (!slug) return { error: "Catégorie introuvable." };
  if (slug === FALLBACK_GARDEN_CATEGORY_SLUG) {
    return { error: "« Autre » ne peut pas être supprimée (catégorie de repli)." };
  }

  let count: number;
  try {
    const rows = await sql`select count(*)::int as n from garden_activity_categories`;
    count = (rows[0] as { n: number } | undefined)?.n ?? 0;
  } catch (e) {
    if (tableMissing(e)) return { error: MIGRATION_MISSING };
    throw e;
  }
  if (count <= 1) return { error: "Impossible de supprimer la dernière catégorie." };

  // Réaffecte d'abord les activités concernées à « autre » (la FK est en
  // ON DELETE RESTRICT), puis supprime.
  try {
    await sql`update garden_activities set category = ${FALLBACK_GARDEN_CATEGORY_SLUG} where category = ${slug}`;
  } catch {
    return { error: "Impossible de réaffecter les activités de cette catégorie." };
  }

  try {
    await sql`delete from garden_activity_categories where slug = ${slug}`;
  } catch {
    return { error: "Impossible de supprimer la catégorie. Réessaie." };
  }

  revalidate();
  return { ok: true };
}

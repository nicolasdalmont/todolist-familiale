"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { CATEGORY_ICON_CHOICES, FALLBACK_CATEGORY_SLUG, slugifyCategory } from "@/lib/categories";

// Gestion des catégories de tâches, réservée au rôle admin (onglet
// « Catégories » de l'écran /admin — voir src/components/CategoryManager.tsx
// et la migration 009). Créer, renommer / changer d'icône, réordonner,
// supprimer (en réaffectant les tâches concernées à « autre »).

type Result = { error?: string; ok?: boolean };

const ICON_NAMES = new Set(CATEGORY_ICON_CHOICES.map((c) => c.name));
const cleanIcon = (raw: unknown) => (ICON_NAMES.has(String(raw)) ? String(raw) : "dots");

// Les catégories apparaissent sur beaucoup d'écrans (liste, détail,
// formulaires, admin) — on invalide tout l'arbre plutôt que d'énumérer.
function revalidate() {
  revalidatePath("/", "layout");
}

export async function createCategoryAction(formData: FormData): Promise<Result> {
  const { supabase } = await requireAdmin();

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Indique un nom." };
  if (label.length > 24) return { error: "Ce nom est trop long." };

  const slug = slugifyCategory(label);
  if (!slug) return { error: "Ce nom ne donne aucun identifiant valide (essaie avec des lettres)." };

  const { data: existing } = await supabase.from("categories").select("slug, position");
  if ((existing ?? []).some((c) => c.slug === slug)) {
    return { error: "Une catégorie très proche existe déjà." };
  }
  const nextPos = Math.max(0, ...(existing ?? []).map((c) => c.position as number)) + 1;

  const { error } = await supabase.from("categories").insert({
    slug,
    label,
    icon: cleanIcon(formData.get("icon")),
    position: nextPos,
  });
  if (error) return { error: "Impossible de créer la catégorie. Réessaie." };

  revalidate();
  return { ok: true };
}

export async function updateCategoryAction(
  slug: string,
  patch: { label?: string; icon?: string }
): Promise<Result> {
  const { supabase } = await requireAdmin();
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

  const { error } = await supabase.from("categories").update(update).eq("slug", slug);
  if (error) return { error: "Impossible d'enregistrer. Réessaie." };

  revalidate();
  return { ok: true };
}

// Échange la position de la catégorie avec sa voisine dans la direction
// demandée — l'ordre pilote l'affichage du sélecteur et des puces.
export async function moveCategoryAction(slug: string, direction: "up" | "down"): Promise<Result> {
  const { supabase } = await requireAdmin();

  const { data: cats } = await supabase
    .from("categories")
    .select("slug, position")
    .order("position");
  const list = cats ?? [];
  const i = list.findIndex((c) => c.slug === slug);
  if (i === -1) return { error: "Catégorie introuvable." };
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return { ok: true };

  const a = list[i];
  const b = list[j];
  await supabase.from("categories").update({ position: b.position }).eq("slug", a.slug);
  await supabase.from("categories").update({ position: a.position }).eq("slug", b.slug);

  revalidate();
  return { ok: true };
}

export async function deleteCategoryAction(slug: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  if (!slug) return { error: "Catégorie introuvable." };
  if (slug === FALLBACK_CATEGORY_SLUG) {
    return { error: "« Autre » ne peut pas être supprimée (catégorie de repli)." };
  }

  const { count } = await supabase
    .from("categories")
    .select("slug", { count: "exact", head: true });
  if ((count ?? 0) <= 1) return { error: "Impossible de supprimer la dernière catégorie." };

  // Réaffecte d'abord les tâches concernées à « autre » (la FK est en
  // ON DELETE RESTRICT), puis supprime.
  const { error: reassignErr } = await supabase
    .from("tasks")
    .update({ category: FALLBACK_CATEGORY_SLUG })
    .eq("category", slug);
  if (reassignErr) return { error: "Impossible de réaffecter les tâches de cette catégorie." };

  const { error } = await supabase.from("categories").delete().eq("slug", slug);
  if (error) return { error: "Impossible de supprimer la catégorie. Réessaie." };

  revalidate();
  return { ok: true };
}

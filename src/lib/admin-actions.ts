"use server";

import { revalidatePath } from "next/cache";
import { hashPassword } from "@/lib/auth";
import { requireAdmin } from "@/lib/admin-guard";
import { pickAvatarColor } from "@/lib/avatar-colors";
import type { Role } from "@/lib/types";

// Gestion des comptes, réservée au rôle admin (onglet « Membres » de
// l'écran /admin — voir src/components/UserManager.tsx) : créer un membre
// avec un mot de passe temporaire, modifier son prénom / son rôle,
// réinitialiser son mot de passe (retour au flux de première connexion),
// le supprimer (et tout ce qu'il a créé).

type Result = { error?: string; ok?: boolean; tempPassword?: string; name?: string };

function cleanTempPassword(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value.length >= 6 ? value : null;
}

export async function createMemberAction(formData: FormData): Promise<Result> {
  const { supabase } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Indique un prénom." };
  if (name.length > 40) return { error: "Ce prénom est trop long." };

  const roleRaw = String(formData.get("role") ?? "user");
  const role: Role = roleRaw === "admin" ? "admin" : "user";

  const tempPassword = cleanTempPassword(formData.get("tempPassword"));
  if (!tempPassword) return { error: "Le mot de passe temporaire doit contenir au moins 6 caractères." };

  // Couleur d'avatar : la première non déjà prise.
  const { data: existing } = await supabase.from("users").select("color");
  const taken = (existing ?? []).map((u) => u.color as string).filter(Boolean);

  const { error } = await supabase.from("users").insert({
    name,
    password_hash: hashPassword(tempPassword),
    role,
    color: pickAvatarColor(taken),
    password_set: false,
  });

  if (error) {
    // 23505 = violation d'unicité (users.name est unique).
    if (error.code === "23505") return { error: `Un membre porte déjà le prénom « ${name} ».` };
    return { error: "Impossible de créer ce membre. Réessaie." };
  }

  revalidatePath("/admin");
  revalidatePath("/login");
  return { ok: true, name, tempPassword };
}

export async function resetMemberPasswordAction(userId: string, tempPassword: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  if (!userId) return { error: "Membre introuvable." };

  const clean = cleanTempPassword(tempPassword);
  if (!clean) return { error: "Le mot de passe temporaire doit contenir au moins 6 caractères." };

  const { data: target } = await supabase.from("users").select("id, name").eq("id", userId).maybeSingle();
  if (!target) return { error: "Membre introuvable." };

  const { error } = await supabase
    .from("users")
    .update({ password_hash: hashPassword(clean), password_set: false })
    .eq("id", userId);
  if (error) return { error: "Impossible de réinitialiser le mot de passe. Réessaie." };

  revalidatePath("/admin");
  revalidatePath("/login");
  return { ok: true, name: target.name as string, tempPassword: clean };
}

export async function updateMemberAction(
  userId: string,
  patch: { name?: string; role?: Role }
): Promise<Result> {
  const { me, supabase } = await requireAdmin();
  if (!userId) return { error: "Membre introuvable." };

  const { data: target } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { error: "Membre introuvable." };

  const update: { name?: string; role?: Role } = {};

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return { error: "Indique un prénom." };
    if (name.length > 40) return { error: "Ce prénom est trop long." };
    if (name !== target.name) update.name = name;
  }

  if (patch.role !== undefined) {
    const role: Role = patch.role === "admin" ? "admin" : "user";
    if (userId === me.id && role !== me.role) {
      return { error: "Tu ne peux pas changer ton propre rôle." };
    }
    if (target.role === "admin" && role !== "admin") {
      const { count } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        return { error: "Impossible de retirer le rôle du dernier administrateur." };
      }
    }
    if (role !== target.role) update.role = role;
  }

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase.from("users").update(update).eq("id", userId);
  if (error) {
    if (error.code === "23505") return { error: `Un membre porte déjà le prénom « ${update.name} ».` };
    return { error: "Impossible d'enregistrer. Réessaie." };
  }

  revalidatePath("/admin");
  revalidatePath("/login");
  revalidatePath("/");
  return { ok: true, name: update.name ?? (target.name as string) };
}

export async function deleteMemberAction(userId: string): Promise<Result> {
  const { me, supabase } = await requireAdmin();
  if (!userId) return { error: "Membre introuvable." };
  if (userId === me.id) return { error: "Tu ne peux pas supprimer ton propre compte." };

  const { data: target } = await supabase.from("users").select("id, name, role").eq("id", userId).maybeSingle();
  if (!target) return { error: "Membre introuvable." };

  if (target.role === "admin") {
    const { count } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return { error: "Impossible de supprimer le dernier administrateur." };
    }
  }

  // Ménage explicite avant de supprimer le compte : les tâches qu'il a
  // créées (avec, en cascade, leurs assigné(e)s, commentaires, tags,
  // checklist, activité et notifications) et ses commentaires laissés sur
  // les tâches d'autres personnes. La migration 008 met aussi ces clés
  // étrangères en ON DELETE CASCADE, mais on ne dépend pas d'elle ici.
  await supabase.from("tasks").delete().eq("created_by", userId);
  await supabase.from("comments").delete().eq("author_id", userId);
  await supabase.from("activity_log").delete().eq("actor_id", userId);

  const { error } = await supabase.from("users").delete().eq("id", userId);
  if (error) return { error: "Impossible de supprimer ce membre. Réessaie." };

  revalidatePath("/admin");
  revalidatePath("/login");
  revalidatePath("/");
  return { ok: true, name: target.name as string };
}

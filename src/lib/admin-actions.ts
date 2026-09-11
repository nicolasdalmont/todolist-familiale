"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
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

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "23505";
}

export async function createMemberAction(formData: FormData): Promise<Result> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Indique un prénom." };
  if (name.length > 40) return { error: "Ce prénom est trop long." };

  const roleRaw = String(formData.get("role") ?? "user");
  const role: Role = roleRaw === "admin" ? "admin" : "user";

  const tempPassword = cleanTempPassword(formData.get("tempPassword"));
  if (!tempPassword) return { error: "Le mot de passe temporaire doit contenir au moins 6 caractères." };

  // Couleur d'avatar : la première non déjà prise.
  const existingRows = await sql`select color from users`;
  const taken = (existingRows as { color: string | null }[]).map((u) => u.color).filter((c): c is string => !!c);

  try {
    await sql`
      insert into users (name, password_hash, role, color, password_set)
      values (${name}, ${hashPassword(tempPassword)}, ${role}, ${pickAvatarColor(taken)}, false)
    `;
  } catch (e) {
    // 23505 = violation d'unicité (users.name est unique).
    if (isUniqueViolation(e)) return { error: `Un membre porte déjà le prénom « ${name} ».` };
    return { error: "Impossible de créer ce membre. Réessaie." };
  }

  revalidatePath("/admin");
  revalidatePath("/login");
  return { ok: true, name, tempPassword };
}

export async function resetMemberPasswordAction(userId: string, tempPassword: string): Promise<Result> {
  await requireAdmin();
  if (!userId) return { error: "Membre introuvable." };

  const clean = cleanTempPassword(tempPassword);
  if (!clean) return { error: "Le mot de passe temporaire doit contenir au moins 6 caractères." };

  const targetRows = await sql`select id, name from users where id = ${userId}`;
  const target = targetRows[0] as { id: string; name: string } | undefined;
  if (!target) return { error: "Membre introuvable." };

  try {
    await sql`update users set password_hash = ${hashPassword(clean)}, password_set = false where id = ${userId}`;
  } catch {
    return { error: "Impossible de réinitialiser le mot de passe. Réessaie." };
  }

  revalidatePath("/admin");
  revalidatePath("/login");
  return { ok: true, name: target.name, tempPassword: clean };
}

export async function updateMemberAction(
  userId: string,
  patch: { name?: string; role?: Role }
): Promise<Result> {
  const { me } = await requireAdmin();
  if (!userId) return { error: "Membre introuvable." };

  const targetRows = await sql`select id, name, role from users where id = ${userId}`;
  const target = targetRows[0] as { id: string; name: string; role: Role } | undefined;
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
      const countRows = await sql`select count(*)::int as n from users where role = 'admin'`;
      if (((countRows[0] as { n: number } | undefined)?.n ?? 0) <= 1) {
        return { error: "Impossible de retirer le rôle du dernier administrateur." };
      }
    }
    if (role !== target.role) update.role = role;
  }

  if (Object.keys(update).length === 0) return { ok: true };

  try {
    await sql`
      update users
      set name = coalesce(${update.name ?? null}, name), role = coalesce(${update.role ?? null}, role)
      where id = ${userId}
    `;
  } catch (e) {
    if (isUniqueViolation(e)) return { error: `Un membre porte déjà le prénom « ${update.name} ».` };
    return { error: "Impossible d'enregistrer. Réessaie." };
  }

  revalidatePath("/admin");
  revalidatePath("/login");
  revalidatePath("/");
  return { ok: true, name: update.name ?? target.name };
}

export async function deleteMemberAction(userId: string): Promise<Result> {
  const { me } = await requireAdmin();
  if (!userId) return { error: "Membre introuvable." };
  if (userId === me.id) return { error: "Tu ne peux pas supprimer ton propre compte." };

  const targetRows = await sql`select id, name, role from users where id = ${userId}`;
  const target = targetRows[0] as { id: string; name: string; role: Role } | undefined;
  if (!target) return { error: "Membre introuvable." };

  if (target.role === "admin") {
    const countRows = await sql`select count(*)::int as n from users where role = 'admin'`;
    if (((countRows[0] as { n: number } | undefined)?.n ?? 0) <= 1) {
      return { error: "Impossible de supprimer le dernier administrateur." };
    }
  }

  // Ménage explicite avant de supprimer le compte : les tâches qu'il a
  // créées (avec, en cascade, leurs assigné(e)s, commentaires, tags,
  // checklist, activité et notifications) et ses commentaires laissés sur
  // les tâches d'autres personnes. Le schéma met aussi ces clés étrangères
  // en ON DELETE CASCADE, mais on ne dépend pas de lui ici.
  await sql`delete from tasks where created_by = ${userId}`;
  await sql`delete from comments where author_id = ${userId}`;
  await sql`delete from activity_log where actor_id = ${userId}`;

  try {
    await sql`delete from users where id = ${userId}`;
  } catch {
    return { error: "Impossible de supprimer ce membre. Réessaie." };
  }

  revalidatePath("/admin");
  revalidatePath("/login");
  revalidatePath("/");
  return { ok: true, name: target.name };
}

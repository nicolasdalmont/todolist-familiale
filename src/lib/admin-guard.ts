import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// Garde commune à toutes les Server Actions d'administration
// (src/lib/admin-actions.ts, src/lib/category-actions.ts,
// src/lib/settings-actions.ts) : session valide + rôle admin. Un
// non-admin déclenche un `throw` (traité comme les pages restreintes —
// on ne confirme pas l'existence de la fonctionnalité).
//
// Fichier séparé (sans "use server") pour pouvoir être importé par
// plusieurs modules d'actions sans devenir lui-même une action exposée.
export async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") {
    throw new Error("Réservé à l'administrateur.");
  }
  return { me };
}

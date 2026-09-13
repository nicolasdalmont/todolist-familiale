"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import type { AgendaKey } from "@/lib/agendas";

// Réglages d'instance, réservés au rôle admin (onglet « Réglages » de
// l'écran /admin — voir src/components/SettingsPanel.tsx et la
// migration 010).

type Result = { error?: string; ok?: boolean };

export async function setReminderEnabledAction(enabled: boolean): Promise<Result> {
  await requireAdmin();

  try {
    await sql`update app_settings set reminder_enabled = ${Boolean(enabled)}, updated_at = now() where id = 1`;
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "42P01") {
      return { error: "Applique d'abord la migration 010_app_settings.sql dans Supabase." };
    }
    return { error: "Impossible d'enregistrer le réglage. Réessaie." };
  }

  revalidatePath("/admin");
  return { ok: true };
}

// Activation individuelle des 4 agendas (migration 009) — voir
// src/lib/agendas.ts. Le nom de colonne ne peut pas être paramétré dans le
// tag SQL : on distingue les 4 cas plutôt que d'interpoler `agenda` dans la
// requête.
export async function setAgendaEnabledAction(agenda: AgendaKey, enabled: boolean): Promise<Result> {
  await requireAdmin();
  const value = Boolean(enabled);

  try {
    switch (agenda) {
      case "jardin":
        await sql`update app_settings set jardin_enabled = ${value}, updated_at = now() where id = 1`;
        break;
      case "voiture":
        await sql`update app_settings set voiture_enabled = ${value}, updated_at = now() where id = 1`;
        break;
      case "sante":
        await sql`update app_settings set sante_enabled = ${value}, updated_at = now() where id = 1`;
        break;
      case "finances":
        await sql`update app_settings set finances_enabled = ${value}, updated_at = now() where id = 1`;
        break;
    }
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "42P01") {
      return { error: "Applique d'abord la migration 009_agenda_toggles.sql sur Neon." };
    }
    return { error: "Impossible d'enregistrer le réglage. Réessaie." };
  }

  revalidatePath("/admin");
  return { ok: true };
}

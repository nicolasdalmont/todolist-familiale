"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

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

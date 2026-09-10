"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";

// Réglages d'instance, réservés au rôle admin (onglet « Réglages » de
// l'écran /admin — voir src/components/SettingsPanel.tsx et la
// migration 010).

type Result = { error?: string; ok?: boolean };

export async function setReminderEnabledAction(enabled: boolean): Promise<Result> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("app_settings")
    .update({ reminder_enabled: Boolean(enabled), updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { error: "Impossible d'enregistrer le réglage. Réessaie." };

  revalidatePath("/admin");
  return { ok: true };
}

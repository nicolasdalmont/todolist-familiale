import type { AppSettings } from "./types";

// Registre des 4 agendas activables individuellement depuis l'admin
// (migration 009, colonnes `*_enabled` sur `app_settings`) — voir
// SettingsPanel.tsx et setAgendaEnabledAction (src/lib/settings-actions.ts).
// La clé correspond au slug de catégorie de tâche associé (voir
// GARDEN_CATEGORY_SLUG et consorts dans src/lib/{garden,car,health,
// finances}.ts).
export type AgendaKey = "jardin" | "voiture" | "sante" | "finances";

export const AGENDA_KEYS: AgendaKey[] = ["jardin", "voiture", "sante", "finances"];

export const AGENDA_INFO: Record<AgendaKey, { label: string; settingsKey: keyof AppSettings }> = {
  jardin: { label: "Jardin", settingsKey: "jardinEnabled" },
  voiture: { label: "Voiture", settingsKey: "voitureEnabled" },
  sante: { label: "Santé", settingsKey: "santeEnabled" },
  finances: { label: "Finances", settingsKey: "financesEnabled" },
};

export function isAgendaEnabled(settings: AppSettings, agenda: AgendaKey): boolean {
  return settings[AGENDA_INFO[agenda].settingsKey];
}

// Utilisé pour masquer le menu "Agendas" (Topbar/BottomNav) quand aucun
// agenda n'est activé.
export function anyAgendaEnabled(settings: AppSettings): boolean {
  return AGENDA_KEYS.some((key) => isAgendaEnabled(settings, key));
}

// Palette de couleurs d'avatar (fond de la pastille d'initiales, texte
// blanc par-dessus — voir src/components/Avatar.tsx). Teintes distinctes,
// assez foncées pour un bon contraste avec le blanc. Utilisée à la
// création d'un membre depuis l'écran /admin : on prend la première
// couleur non déjà attribuée, puis on repart au début si toutes sont
// prises.
export const AVATAR_COLORS = [
  "#0E7C66",
  "#2E6F9E",
  "#6C5CE7",
  "#B0326B",
  "#C2410C",
  "#7C3AED",
  "#0E7490",
  "#B45309",
  "#4D7C0F",
  "#BE185D",
];

export function pickAvatarColor(usedColors: string[]): string {
  const used = new Set(usedColors);
  const free = AVATAR_COLORS.find((c) => !used.has(c));
  return free ?? AVATAR_COLORS[usedColors.length % AVATAR_COLORS.length];
}

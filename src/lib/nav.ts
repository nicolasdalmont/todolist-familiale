// Nettoie un paramètre `next` (destination post-connexion, audit UX UX-6)
// avant de l'utiliser dans un redirect() : uniquement un chemin interne
// absolu, jamais une URL externe (`//evil.com`, `https://…`) ni un chemin
// relatif. Renvoie "/" par défaut.
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  // Doit commencer par un seul "/", pas "//" ni "/\".
  if (!/^\/(?!\/|\\)/.test(value)) return "/";
  return value;
}

// Génère un mot de passe temporaire lisible, à communiquer de vive voix ou
// par message à la personne qui vient d'être créée / réinitialisée par
// l'administrateur (écran /admin, onglet « Membres »). Un mot + trois
// chiffres : assez court pour être dicté, assez long pour la règle des 6
// caractères minimum (voir setPasswordAction dans src/lib/actions.ts).
// L'utilisateur le remplace de toute façon par son propre mot de passe à
// la première connexion (password_set = false).
const WORDS = [
  "colibri",
  "noisette",
  "mandarine",
  "potiron",
  "edredon",
  "boussole",
  "lanterne",
  "pinceau",
  "myrtille",
  "cabane",
  "ricochet",
  "trefle",
];

export function generateTempPassword(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const digits = String(Math.floor(100 + Math.random() * 900));
  return `${word}-${digits}`;
}

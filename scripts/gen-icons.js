// Génère les icônes PWA (public/icons/icon-192.png, icon-512.png) à partir
// d'un SVG dessiné en code, via sharp. À relancer manuellement si la charte
// graphique change (aucune dépendance ajoutée au projet lui-même : ce
// script n'est pas importé par l'application, seulement utilisé en local
// pour régénérer les PNG).
//
// Usage : node scripts/gen-icons.js

const sharp = require("sharp");
const path = require("path");

// Icône "presse-papiers à cocher" : plus évocatrice d'une to-do list que le
// simple check générique de la précédente version, dans la nouvelle charte
// orange/écru.
function svgIcon(size) {
  const r = size * 0.22;
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#E2621F"/>
        <stop offset="100%" stop-color="#F3A467"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>

    <!-- Corps du presse-papiers -->
    <rect x="${size * 0.27}" y="${size * 0.20}" width="${size * 0.46}" height="${size * 0.60}"
      rx="${size * 0.06}" fill="#FBF3E4"/>
    <!-- Pince du haut -->
    <rect x="${size * 0.41}" y="${size * 0.14}" width="${size * 0.18}" height="${size * 0.09}"
      rx="${size * 0.025}" fill="#FBF3E4"/>

    <!-- Ligne 1 : tâche cochée -->
    <path d="M ${size * 0.335} ${size * 0.405} L ${size * 0.385} ${size * 0.455} L ${size * 0.475} ${size * 0.345}"
      stroke="#C14E15" stroke-width="${size * 0.032}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="${size * 0.50}" y="${size * 0.385}" width="${size * 0.15}" height="${size * 0.045}"
      rx="${size * 0.02}" fill="#C14E15"/>

    <!-- Ligne 2 : tâche cochée -->
    <path d="M ${size * 0.335} ${size * 0.565} L ${size * 0.385} ${size * 0.615} L ${size * 0.475} ${size * 0.505}"
      stroke="#C14E15" stroke-width="${size * 0.032}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="${size * 0.50}" y="${size * 0.545}" width="${size * 0.15}" height="${size * 0.045}"
      rx="${size * 0.02}" fill="#C14E15"/>

    <!-- Ligne 3 : tâche en attente (case vide) -->
    <rect x="${size * 0.335} " y="${size * 0.685}" width="${size * 0.09}" height="${size * 0.09}"
      rx="${size * 0.02}" fill="none" stroke="#D9A87A" stroke-width="${size * 0.026}"/>
    <rect x="${size * 0.50}" y="${size * 0.705}" width="${size * 0.15}" height="${size * 0.045}"
      rx="${size * 0.02}" fill="#E9CBA6"/>
  </svg>`;
}

async function main() {
  const outDir = path.join(__dirname, "..", "public", "icons");
  for (const size of [192, 512]) {
    const svg = Buffer.from(svgIcon(size));
    await sharp(svg).png().toFile(path.join(outDir, `icon-${size}.png`));
    console.log("generated icon-" + size + ".png");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

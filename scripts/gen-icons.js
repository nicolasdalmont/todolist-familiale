// Génère les icônes PWA (public/icons/icon-192.png, icon-512.png) à partir
// d'un SVG dessiné en code, via sharp (devDependency — utilisé seulement
// par ce script, pas importé par l'application).
//
// Usage : node scripts/gen-icons.js
//
// Icône « Checkberry » : fond rose framboise, framboise (le fruit) en
// blanc — grappe de drupéoles + petite feuille —, coche rose par-dessus.
// Le même dessin est repris en composant React pour le logo dans
// l'interface (IconBerry, src/components/Icons.tsx).

const sharp = require("sharp");
const path = require("path");

function svgIcon(size) {
  const r = size * 0.22;
  const s = size / 100;
  const p = (n) => (n * s).toFixed(2);
  const drupes = [
    [39, 42, 9], [51, 40, 9], [62, 43, 8.6],
    [34, 52, 8.6], [46, 51, 8.8], [57, 52, 8.6], [67, 53, 7.8],
    [40, 61, 8.2], [51, 61, 8.4], [61, 61, 7.6],
    [45, 70, 7.6], [55, 70, 7.2],
    [50, 78, 6.6],
  ]
    .map(([cx, cy, rr]) => `<circle cx="${p(cx)}" cy="${p(cy)}" r="${p(rr)}"/>`)
    .join("");
  const leaf = `<path d="M ${p(50)} ${p(33)} C ${p(43)} ${p(24)}, ${p(35)} ${p(25)}, ${p(34)} ${p(30)} C ${p(40)} ${p(31)}, ${p(45)} ${p(34)}, ${p(50)} ${p(38)} C ${p(55)} ${p(34)}, ${p(60)} ${p(31)}, ${p(66)} ${p(30)} C ${p(65)} ${p(25)}, ${p(57)} ${p(24)}, ${p(50)} ${p(33)} Z"/>`;
  // Le fruit (grappe + feuille) est pivoté de 30° dans le sens horaire et
  // agrandi de 50 %, autour de son centre visuel (~50, 54) ; il est écrêté
  // au carré arrondi pour ne pas déborder dans les coins. La coche, elle,
  // reste droite et à sa place, par-dessus le fruit agrandi.
  const cx = p(50);
  const cy = p(54);
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="iconclip"><rect width="${size}" height="${size}" rx="${r}"/></clipPath></defs>
    <rect width="${size}" height="${size}" rx="${r}" fill="#D6336C"/>
    <g clip-path="url(#iconclip)">
      <g fill="#FFFFFF" transform="translate(${cx} ${cy}) rotate(30) scale(1.5) translate(-${cx} -${cy})">${leaf}${drupes}</g>
      <path d="M ${p(38)} ${p(56)} L ${p(48)} ${p(66)} L ${p(66)} ${p(46)}"
        stroke="#D6336C" stroke-width="${p(9)}" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </svg>`;
}

async function main() {
  const outDir = path.join(__dirname, "..", "public", "icons");
  for (const size of [192, 512]) {
    const svg = Buffer.from(svgIcon(size));
    await sharp(svg).png().toFile(path.join(outDir, `icon-${size}.png`));
    console.log("generated icon-" + size + ".png");
  }

  // Favicon PNG de repli (navigateurs qui n'affichent pas src/app/icon.svg) :
  // App Router détecte src/app/icon.png et l'émet en <link rel="icon"> aux
  // côtés du SVG. Même dessin, rastérisé petit.
  const appDir = path.join(__dirname, "..", "src", "app");
  await sharp(Buffer.from(svgIcon(48))).png().toFile(path.join(appDir, "icon.png"));
  console.log("generated src/app/icon.png (48)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Widget iPhone pour la To-Do List Familiale — app "Scriptable" (gratuite,
// App Store). Affiche le streak, le nombre de tâches du jour et le nombre
// de tâches en retard d'un profil, en tapant sur des données lues via
// /api/widget (src/app/api/widget/route.ts) — jamais le cookie de session
// de l'app, un jeton dédié en lecture seule (voir plus bas).
//
// Installation :
// 1. Installer l'app "Scriptable" depuis l'App Store.
// 2. Créer un nouveau script, coller tout ce fichier dedans.
// 3. Remplir les 3 constantes ci-dessous (API_URL, TOKEN, APP_URL).
// 4. Depuis l'écran d'accueil de l'iPhone : appui long > "+" > widget
//    "Scriptable" (petit ou moyen) > le configurer pour qu'il lance CE
//    script (paramètre "Script" du widget).
//
// Le tap sur le widget ouvre l'app dans Safari (voir APP_URL) — c'est une
// limite d'iOS, pas de ce script : un widget ne peut pas relancer une PWA
// installée en mode plein écran, seulement une URL classique.

const API_URL = "https://TON-DOMAINE.vercel.app/api/widget"; // ex: https://todolist-familiale-sage.vercel.app/api/widget
const TOKEN = "COLLE_ICI_LA_VALEUR_DE_WIDGET_TOKEN"; // même valeur que la variable d'env WIDGET_TOKEN
const APP_URL = "https://TON-DOMAINE.vercel.app/"; // ouvert au tap sur le widget

async function fetchSummary() {
  const req = new Request(API_URL);
  req.headers = { Authorization: `Bearer ${TOKEN}` };
  req.timeoutInterval = 10;
  const data = await req.loadJSON();
  if (req.response && req.response.statusCode !== 200) {
    throw new Error(data?.error || `HTTP ${req.response.statusCode}`);
  }
  return data;
}

async function loadIcon() {
  const iconUrl = `${APP_URL.replace(/\/$/, "")}/icons/icon-192.png`;
  return await new Request(iconUrl).loadImage();
}

// Rendu entier du widget en une seule image, dessinée directement via
// DrawContext (texte compris). Après plusieurs essais avec des
// WidgetStack empilés (largeurs fixes, centerAlignContent…), le centrage
// des deux compteurs restait peu fiable une fois testé sur l'appareil —
// dessiner soi-même chaque élément à des coordonnées précises lève
// l'ambiguïté et reproduit exactement la maquette validée.
async function renderWidgetImage(data, isDark) {
  const size = 172; // un petit widget iOS est toujours carré, quelle que
                     // soit sa taille réelle en points selon l'iPhone —
                     // cette image est mise à l'échelle automatiquement.
  const padding = 14;
  const contentWidth = size - padding * 2; // 144

  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = true;
  ctx.respectScreenScale = true;

  const bgHex = isDark ? "1c1c1e" : "ffffff";
  const textColor = new Color(isDark ? "ffffff" : "000000");
  const mutedColor = new Color(isDark ? "999999" : "666666");
  const dangerColor = new Color(isDark ? "ff6b6b" : "d64545");

  // Fond uni.
  ctx.setFillColor(new Color(bgHex));
  ctx.fillRect(new Rect(0, 0, size, size));

  // Filigrane du logo checkberry, éclairci. DrawContext n'a pas de réglage
  // d'opacité pour dessiner une image (drawImageInRect() est toujours à
  // pleine opacité) — l'éclaircissement s'obtient donc en dessinant le
  // logo à pleine opacité PUIS en superposant un rectangle de la couleur
  // de fond en semi-transparence par-dessus : mathématiquement identique
  // à réduire l'opacité du logo sur un fond uni. Pas bloquant si le logo
  // ne charge pas (réseau capricieux) : le widget reste lisible sans.
  try {
    const icon = await loadIcon();
    ctx.drawImageInRect(icon, new Rect(0, 0, size * 1.5, size * 1.5));
    ctx.setFillColor(new Color(bgHex, isDark ? 0.86 : 0.91));
    ctx.fillRect(new Rect(0, 0, size, size));
  } catch (e) {
    // silencieux : fond uni déjà dessiné plus haut.
  }

  // En-tête : nom de l'app à gauche, streak à droite.
  ctx.setFont(Font.boldSystemFont(13));
  ctx.setTextColor(textColor);
  ctx.setTextAlignedLeft();
  ctx.drawTextInRect("checkberry", new Rect(padding, padding, 100, 16));

  ctx.setFont(Font.systemFont(13));
  ctx.setTextAlignedRight();
  ctx.drawTextInRect(
    `${data.streak > 0 ? "🔥" : "💤"} ${data.streak ?? 0}`,
    new Rect(size - padding - 60, padding, 60, 16)
  );

  // Deux colonnes de largeur égale pour les compteurs — coordonnées fixes,
  // donc centrage garanti quel que soit le contenu.
  const gap = 8;
  const colWidth = (contentWidth - gap) / 2;
  const col1X = padding;
  const col2X = padding + colWidth + gap;
  const numberY = 62;
  const labelY = numberY + 48;

  ctx.setFont(Font.boldSystemFont(42));
  ctx.setTextColor(textColor);
  ctx.setTextAlignedCenter();
  ctx.drawTextInRect(String(data.todayCount ?? 0), new Rect(col1X, numberY, colWidth, 48));

  ctx.setTextColor(dangerColor);
  ctx.drawTextInRect(String(data.overdueCount ?? 0), new Rect(col2X, numberY, colWidth, 48));

  ctx.setFont(Font.systemFont(11));
  ctx.setTextColor(mutedColor);
  ctx.drawTextInRect("aujourd'hui", new Rect(col1X, labelY, colWidth, 28));
  ctx.drawTextInRect("en retard", new Rect(col2X, labelY, colWidth, 28));

  // Horodatage, en bas à droite.
  ctx.setFont(Font.systemFont(9));
  ctx.drawTextInRect(
    `màj ${new Date(data.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    new Rect(size - padding - 70, size - padding - 12, 70, 12)
  );

  return ctx.getImage();
}

async function buildWidget(data) {
  const isDark = Device.isUsingDarkAppearance();
  const w = new ListWidget();
  w.url = APP_URL;
  w.backgroundImage = await renderWidgetImage(data, isDark);

  // Redemande une actualisation dans ~30 min — iOS reste maître du rythme
  // réel (il ne rafraîchit pas forcément pile à cette heure-là), c'est juste
  // une indication.
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  return w;
}

function errorWidget(message) {
  const w = new ListWidget();
  w.url = APP_URL;
  const title = w.addText("⚠️ Widget");
  title.font = Font.boldSystemFont(14);
  w.addSpacer(6);
  const body = w.addText(String(message));
  body.font = Font.systemFont(11);
  body.textColor = Color.red();
  return w;
}

async function run() {
  let widget;
  try {
    const data = await fetchSummary();
    widget = await buildWidget(data);
  } catch (e) {
    widget = errorWidget(e.message ?? e);
  }

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    // Lancé manuellement depuis Scriptable (pas depuis un widget) : affiche
    // un aperçu pour vérifier que tout est bien configuré.
    await widget.presentSmall();
  }
  Script.complete();
}

await run();

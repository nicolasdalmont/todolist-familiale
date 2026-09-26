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

const API_URL = "https://TON-DOMAINE.vercel.app/api/widget"; // ex: https://todolist-familiale.vercel.app/api/widget
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

function addRow(stack, label, value) {
  const row = stack.addStack();
  row.layoutHorizontally();
  const labelText = row.addText(label);
  labelText.font = Font.systemFont(13);
  labelText.textColor = Color.dynamic(new Color("#666666"), new Color("#999999"));
  row.addSpacer();
  const valueText = row.addText(String(value));
  valueText.font = Font.boldSystemFont(13);
}

function buildWidget(data) {
  const w = new ListWidget();
  w.url = APP_URL;
  w.backgroundColor = Color.dynamic(new Color("#ffffff"), new Color("#1c1c1e"));
  w.setPadding(14, 14, 14, 14);

  const name = w.addText(data.profileName ?? "Famille");
  name.font = Font.boldSystemFont(15);

  w.addSpacer(6);

  const streakStack = w.addStack();
  streakStack.layoutHorizontally();
  streakStack.centerAlignContent();
  const streakEmoji = streakStack.addText(data.streak > 0 ? "🔥" : "💤");
  streakEmoji.font = Font.systemFont(20);
  streakStack.addSpacer(6);
  const streakValue = streakStack.addText(`${data.streak}`);
  streakValue.font = Font.boldSystemFont(24);
  streakStack.addSpacer(4);
  const streakLabel = streakStack.addText(data.streak > 1 ? "jours" : "jour");
  streakLabel.font = Font.systemFont(13);
  streakLabel.textColor = Color.dynamic(new Color("#666666"), new Color("#999999"));

  w.addSpacer(10)

  addRow(w, "Aujourd'hui", data.todayCount ?? 0);
  addRow(w, "En retard", data.overdueCount ?? 0);

  w.addSpacer(8);

  const updated = new Date(data.updatedAt);
  const updatedText = w.addText(`màj ${updated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`);
  updatedText.font = Font.systemFont(10);
  updatedText.textColor = Color.dynamic(new Color("#999999"), new Color("#666666"));

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
    widget = buildWidget(data);
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

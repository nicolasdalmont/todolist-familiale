// Migration des données Supabase <-> Neon, en Node pur (pas de pg_dump).
// Copie les 12 tables d'une base à l'autre. Voir docs/migration-neon.md
// (Phases 2, 3, 5) et le filet de sécurité § 3.
//
//   node db/migrate.mjs                 # Supabase -> Neon  (par défaut)
//   node db/migrate.mjs --rollback      # Neon -> Supabase  (filet niveau 3, DEMANDE confirmation)
//
// Variables d'environnement requises (chaînes DIRECTES, host SANS -pooler) :
//   SUPABASE_DIRECT_URL   Supabase -> Project Settings -> Database -> "URI"
//   NEON_DIRECT_URL       Neon -> Connection Details -> "Direct connection"
// À passer en `export ...` dans le terminal — pas dans .env.local, pas dans le chat.
//
// La SOURCE n'est jamais modifiée ; la CIBLE est vidée (truncate) puis remplie.

import pg from "pg";
import readline from "node:readline";

// Ordre de dépendance des FK pour l'insertion ; l'inverse pour le truncate.
const TABLES = [
  "users",
  "categories",
  "app_settings",
  "tags",
  "tasks",
  "task_assignees",
  "task_tags",
  "checklist_items",
  "comments",
  "activity_log",
  "notifications",
  "push_subscriptions",
];

const rollback = process.argv.includes("--rollback");
const SRC_URL = rollback ? process.env.NEON_DIRECT_URL : process.env.SUPABASE_DIRECT_URL;
const DST_URL = rollback ? process.env.SUPABASE_DIRECT_URL : process.env.NEON_DIRECT_URL;
const SRC_NAME = rollback ? "Neon" : "Supabase";
const DST_NAME = rollback ? "Supabase" : "Neon";

if (!SRC_URL || !DST_URL) {
  console.error("Manque SUPABASE_DIRECT_URL et/ou NEON_DIRECT_URL dans l'environnement.");
  process.exit(1);
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a); }));
}

// jsonb : `pg` enverrait un objet/tableau JS comme un array Postgres -> on
// sérialise en texte JSON, accepté tel quel par une colonne jsonb.
// Concerne tasks.recurrence.
const norm = (v) =>
  v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;

async function countAll(client) {
  const out = {};
  for (const t of TABLES) {
    const { rows } = await client.query(`select count(*)::int n from "${t}"`);
    out[t] = rows[0].n;
  }
  return out;
}

async function main() {
  console.log(`Migration ${SRC_NAME} -> ${DST_NAME}`);
  if (rollback) {
    const a = await ask('!! Cela VIDE puis réécrit les 12 tables de Supabase. Taper "ROLLBACK" : ');
    if (a !== "ROLLBACK") { console.log("Annulé."); process.exit(1); }
  }

  const src = new pg.Client({ connectionString: SRC_URL, ssl: { rejectUnauthorized: false } });
  const dst = new pg.Client({ connectionString: DST_URL, ssl: { rejectUnauthorized: false } });
  await src.connect();
  await dst.connect();

  try {
    console.log(`\nVidage de ${DST_NAME}…`);
    await dst.query(
      `truncate ${[...TABLES].reverse().map((t) => `"${t}"`).join(", ")} restart identity cascade`
    );

    console.log("Copie des données :");
    for (const t of TABLES) {
      const { rows } = await src.query(`select * from "${t}"`);
      if (rows.length === 0) { console.log(`  ${t.padEnd(18)} 0`); continue; }

      // N'insérer que les colonnes présentes des DEUX côtés (le schéma peut
      // diverger le temps de la fenêtre de coexistence).
      const dstColsRes = await dst.query(
        `select column_name from information_schema.columns where table_name = $1`,
        [t]
      );
      const dstCols = new Set(dstColsRes.rows.map((r) => r.column_name));
      const cols = Object.keys(rows[0]).filter((c) => dstCols.has(c));
      const skipped = Object.keys(rows[0]).filter((c) => !dstCols.has(c));
      const colList = cols.map((c) => `"${c}"`).join(", ");
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const text = `insert into "${t}" (${colList}) values (${placeholders})`;
      for (const row of rows) {
        await dst.query(text, cols.map((c) => norm(row[c])));
      }
      console.log(
        `  ${t.padEnd(18)} ${rows.length}${skipped.length ? `  (colonnes ignorées : ${skipped.join(", ")})` : ""}`
      );
    }

    console.log("\nVérification des volumes :");
    const [cs, cd] = [await countAll(src), await countAll(dst)];
    let mismatch = false;
    for (const t of TABLES) {
      const ok = cs[t] === cd[t];
      if (!ok) mismatch = true;
      console.log(`  ${ok ? "OK " : "KO "} ${t.padEnd(18)} ${SRC_NAME} ${cs[t]}  |  ${DST_NAME} ${cd[t]}`);
    }

    console.log(mismatch ? "\n⚠️  Écart de volume — à investiguer." : "\n✅  Volumes identiques.");
    console.log("\nContrôles à faire à la main (docs/migration-neon.md § 7) :");
    console.log("  - users              : password_hash non nul et IDENTIQUE à la source");
    console.log("  - tasks              : recurrence (jsonb) OK sur 2-3 lignes, due_at cohérents");
    console.log("  - task_assignees     : rôles editor/viewer préservés");
    console.log("  - categories/app_settings : repris de la source (le truncate a effacé l'amorçage de neon_schema.sql)");
    console.log("  - push_subscriptions : endpoint + p256dh/auth intacts");
  } finally {
    await src.end();
    await dst.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

// Phase 0 de la migration Neon (docs/migration-neon.md § 4) — tests décisifs
// contre le projet Neon PILOTE (jetable), via le driver que l'appli
// utilisera (@neondatabase/serverless).
//
// Pré-requis : dans .env.local (gitignoré, jamais dans le chat) —
//   DATABASE_URL=postgresql://...@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
// et db/neon_schema.sql exécuté sur le pilote (SQL Editor Neon).
//
// Usage :  node db/phase0_test.mjs

import { readFileSync } from "node:fs";
import { scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

if (!env.DATABASE_URL) {
  console.error("DATABASE_URL absente de .env.local");
  process.exit(1);
}

const sql = neon(env.DATABASE_URL, { fetchOptions: { cache: "no-store" } });

let failures = 0;
const check = (cond, msg) => {
  console.log(cond ? "  ✅" : "  ❌", msg);
  if (!cond) failures++;
};

// verifyPassword() de src/lib/auth.ts, à l'identique (scrypt, sel = chaîne
// hex utilisée telle quelle, format "selHex:cleHex").
function verifyPassword(password, storedHash) {
  const [salt, keyHex] = storedHash.split(":");
  if (!salt || !keyHex) return false;
  const storedKey = Buffer.from(keyHex, "hex");
  const derivedKey = scryptSync(password, salt, storedKey.length);
  return derivedKey.length === storedKey.length && timingSafeEqual(derivedKey, storedKey);
}

async function main() {
  // --- 1. Connexion + latence (cold start autosuspend Neon) ---
  console.log("\n1. Connexion & latence");
  let t = Date.now();
  const [{ now }] = await sql`select now()`;
  const cold = Date.now() - t;
  t = Date.now();
  await sql`select 1`;
  const warm = Date.now() - t;
  console.log(`  now() = ${now}`);
  console.log(`  1re requête : ${cold} ms  |  2e (chaud) : ${warm} ms`);
  check(cold < 3000, `cold start < 3 s (${cold} ms)`);
  check(warm < 300, `requête chaude < 300 ms (${warm} ms)`);

  // --- 2. scrypt inter-op : le hash "Admin" semé par neon_schema.sql doit
  //     valider "bonjour2026" (⇒ les password_hash migrés resteront bons) ---
  console.log("\n2. Hachage de mot de passe (scrypt)");
  const rows = await sql`select password_hash from users where name = 'Admin'`;
  check(rows.length === 1, "compte Admin présent (neon_schema.sql exécuté ?)");
  if (rows.length === 1) {
    check(verifyPassword("bonjour2026", rows[0].password_hash), "verifyPassword('bonjour2026') OK");
    check(!verifyPassword("mauvais", rows[0].password_hash), "verifyPassword('mauvais') = false");
  }

  // --- 3. jsonb : tasks.recurrence, objet JS → doit être sérialisé ---
  console.log("\n3. Colonne jsonb (tasks.recurrence)");
  const [{ id: adminId }] = await sql`select id from users where name = 'Admin'`;
  const taskId = randomUUID();
  const recurrence = { type: "custom", interval: 2, unit: "weeks" };
  try {
    // JSON.stringify explicite : le driver encode un objet JS brut comme un
    // array Postgres "{...}", rejeté par jsonb.
    await sql`
      insert into tasks (id, title, created_by, category, recurrence)
      values (${taskId}, ${"__phase0__"}, ${adminId}, ${"autre"}, ${JSON.stringify(recurrence)})
    `;
    const [row] = await sql`select recurrence from tasks where id = ${taskId}`;
    check(
      row.recurrence?.type === "custom" && row.recurrence?.interval === 2 && row.recurrence?.unit === "weeks",
      `recurrence relue = ${JSON.stringify(row.recurrence)}`
    );
  } catch (e) {
    check(false, `insert jsonb : ${e.message}`);
  }

  // --- 4. Requête imbriquée (forme getTask) : tâche + assignés(+users) +
  //     tags + checklist + nb de commentaires, assemblée en SQL ---
  console.log("\n4. Requête imbriquée (assignés / tags / checklist / commentaires)");
  try {
    await sql`insert into task_assignees (task_id, user_id, role) values (${taskId}, ${adminId}, 'editor')`;
    const [tagRow] = await sql`
      insert into tags (name) values (${"__phase0tag__"})
      on conflict (name) do update set name = excluded.name returning id`;
    await sql`insert into task_tags (task_id, tag_id) values (${taskId}, ${tagRow.id})`;
    await sql`insert into checklist_items (task_id, label) values (${taskId}, ${"item A"}), (${taskId}, ${"item B"})`;
    await sql`insert into comments (task_id, author_id, body) values (${taskId}, ${adminId}, ${"hello"})`;

    const [task] = await sql`
      select
        t.*,
        coalesce(
          (select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'color', u.color, 'role', a.role) order by u.name)
           from task_assignees a join users u on u.id = a.user_id where a.task_id = t.id),
          '[]'::jsonb) as assignees,
        coalesce(
          (select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name)
           from task_tags tt join tags g on g.id = tt.tag_id where tt.task_id = t.id),
          '[]'::jsonb) as tags,
        coalesce(
          (select jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'done', c.done, 'created_at', c.created_at) order by c.created_at)
           from checklist_items c where c.task_id = t.id),
          '[]'::jsonb) as checklist,
        (select count(*)::int from comments cm where cm.task_id = t.id) as comment_count
      from tasks t
      where t.id = ${taskId}
    `;
    check(Array.isArray(task.assignees) && task.assignees.length === 1 && task.assignees[0].name === "Admin", `assignees = ${JSON.stringify(task.assignees)}`);
    check(Array.isArray(task.tags) && task.tags.length === 1, `tags = ${JSON.stringify(task.tags)}`);
    check(Array.isArray(task.checklist) && task.checklist.length === 2, `checklist (${task.checklist.length} items)`);
    check(task.comment_count === 1, `comment_count = ${task.comment_count}`);
  } catch (e) {
    check(false, `requête imbriquée : ${e.message}`);
  }

  // --- 5. Codes d'erreur Postgres (gardes de l'appli) ---
  console.log("\n5. Codes d'erreur");
  try {
    await sql`insert into users (name, password_hash) values ('Admin', 'x')`;
    check(false, "doublon de prénom aurait dû échouer");
  } catch (e) {
    check(e.code === "23505", `violation d'unicité → code ${e.code} (attendu 23505)`);
  }
  try {
    await sql`select 1 from table_qui_nexiste_pas`;
    check(false, "table absente aurait dû échouer");
  } catch (e) {
    check(e.code === "42P01", `table absente → code ${e.code} (attendu 42P01)`);
  }

  // --- Nettoyage ---
  await sql`delete from tasks where id = ${taskId}`; // cascade assignees/tags/checklist/comments
  await sql`delete from tags where name = '__phase0tag__'`;

  console.log(failures === 0 ? "\n✅ PHASE 0 : tout passe — approche « SQL brut » confirmée." : `\n❌ ${failures} échec(s) — voir ci-dessus.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nErreur inattendue :", e);
  process.exit(1);
});

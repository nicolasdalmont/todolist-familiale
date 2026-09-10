import { neon } from "@neondatabase/serverless";

// Accès Postgres — remplace le client PostgREST Supabase
// (src/lib/supabase/admin.ts) après la migration Neon (voir
// docs/migration-neon.md).
//
// `@neondatabase/serverless` fait un aller-retour HTTP par requête : rien à
// pooler, compatible runtimes Node et Edge. La chaîne DATABASE_URL (avec
// identifiants) ne vit QUE côté serveur — jamais dans le navigateur.
//
// `fetchOptions.cache: "no-store"` reproduit le contournement déjà en place
// pour Supabase : Next met en cache les GET fetch() des Server Components
// (Data Cache), y compris ceux du driver — sans ça une lecture peut
// renvoyer un instantané périmé sur une page pourtant `force-dynamic`.
//
// Deux formes d'appel :
//   await sql`select * from users where id = ${id}`   // paramétré ($1)
//   await sql.query(text, params)                     // SQL dynamique

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL manquante dans les variables d'environnement.");
}

export const sql = neon(url, { fetchOptions: { cache: "no-store" } });

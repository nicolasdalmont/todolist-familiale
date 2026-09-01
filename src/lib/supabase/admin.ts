import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Client Supabase "admin", utilisé exclusivement côté serveur avec la clé
// service_role : cette clé contourne intégralement Row Level Security, ce
// qui est le choix assumé de cette architecture (voir supabase/schema.sql).
// Elle ne doit jamais être exposée au navigateur ni utilisée dans un
// composant client — uniquement dans des Server Components, Server Actions
// ou Route Handlers.
let cachedClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant(e) dans les variables d'environnement."
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cachedClient;
}

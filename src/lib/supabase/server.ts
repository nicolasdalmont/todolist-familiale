import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase pour Server Components / Server Actions. Lit et écrit la
// session depuis les cookies de la requête, afin que les policies RLS
// s'appliquent avec l'identité de l'utilisateur connecté.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Appelé depuis un Server Component pur : le middleware se
            // charge déjà du rafraîchissement de session, on peut ignorer.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // idem
          }
        },
      },
    }
  );
}

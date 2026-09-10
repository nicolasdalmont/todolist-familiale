import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

// Efface le cookie de session puis renvoie vers l'écran de connexion.
// Utilisé quand une session est valide *cryptographiquement* mais pointe
// vers un compte qui n'existe plus (membre supprimé par un administrateur
// pendant qu'il était connecté sur un appareil) : sans ça, `/` redirige
// vers `/login`, que le middleware — qui ne voit que la signature du JWT,
// pas la base — renvoie aussitôt vers `/`, d'où une boucle. Ici on
// nettoie le cookie (ce qu'un Server Component ne peut pas faire) pour
// casser la boucle. Exclu du middleware (voir src/middleware.ts).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  clearSessionCookie();
  return NextResponse.redirect(new URL("/login", request.url));
}

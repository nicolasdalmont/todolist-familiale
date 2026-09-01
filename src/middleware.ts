import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

// Middleware Edge : vérifie uniquement la signature du cookie de session
// (JWT), sans appel réseau vers Supabase — l'authentification ne repose
// plus sur Supabase Auth mais sur une table "users" maison, interrogée
// uniquement côté Server Components/Actions via la clé service_role.
const SESSION_COOKIE = "session";

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET manquant dans les variables d'environnement.");
  }
  return new TextEncoder().encode(secret);
}

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  try {
    await jwtVerify(token, getSecretKey());
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const authenticated = await hasValidSession(request);
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");

  if (!authenticated && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (authenticated && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)"],
};

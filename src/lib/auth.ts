import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { createAdminClient } from "./supabase/admin";
import type { Profile } from "./types";

// Authentification maison : la table publique "users" stocke un hash de
// mot de passe (scrypt) pour chaque membre de la famille, et la session est
// portée par un cookie contenant un JWT signé (bibliothèque "jose", choisie
// pour sa compatibilité avec le runtime Edge utilisé par le middleware).
// Il n'y a plus de dépendance à Supabase Auth : Supabase ne sert plus que
// de base Postgres, interrogée côté serveur via la clé service_role.

const SESSION_COOKIE = "session";
const KEY_LENGTH = 64;
const SESSION_DURATION = "180d";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET manquant dans les variables d'environnement.");
  }
  return new TextEncoder().encode(secret);
}

// Hash un mot de passe en clair au format "sel_hex:cle_derivee_hex".
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH);
  return `${salt}:${derivedKey.toString("hex")}`;
}

// Vérifie un mot de passe en clair contre un hash stocké, en temps constant.
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(":");
  if (!salt || !keyHex) return false;

  const storedKey = Buffer.from(keyHex, "hex");
  const derivedKey = scryptSync(password, salt, storedKey.length);

  if (derivedKey.length !== storedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}

async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getSecretKey());
}

// À appeler uniquement depuis une Server Action ou un Route Handler (pose
// un cookie, ce que Next.js interdit depuis un Server Component).
export async function setSessionCookie(userId: string): Promise<void> {
  const token = await createSessionToken(userId);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

// Horodate la connexion réussie d'un utilisateur (colonne
// users.last_login_at, migration 003_last_login.sql) — affichée sur
// l'écran de statistiques admin (src/app/admin/page.tsx) comme "dernière
// activité". Appelé depuis loginAction et setPasswordAction
// (src/lib/actions.ts), juste après setSessionCookie. La date est ensuite
// maintenue à jour au fil de l'usage par touchLastSeen() ci-dessous : sans
// ça, la session durant 180 jours, la colonne resterait figée sur la
// dernière saisie de mot de passe. Ne fait jamais échouer la connexion
// elle-même si la mise à jour échoue : ce n'est qu'une statistique, pas
// une condition d'accès.
export async function recordLogin(userId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) console.warn("Impossible d'enregistrer la dernière connexion :", error.message);
}

// Rafraîchit users.last_login_at ("dernière activité" de l'écran /admin) au
// fil de la navigation. La session dure 180 jours (SESSION_DURATION) : un
// membre peut donc utiliser l'appli tous les jours sans jamais repasser
// par loginAction, ce qui laissait la colonne bloquée sur la date de sa
// dernière saisie de mot de passe. On réécrit donc la date à chaque rendu
// de page authentifié (appelé par getCurrentUser), mais au plus une fois
// toutes les 15 minutes, et sans jamais bloquer l'affichage si l'écriture
// échoue.
const LAST_SEEN_REFRESH_MS = 15 * 60 * 1000;

async function touchLastSeen(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  currentValue: string | null
): Promise<void> {
  const last = currentValue ? Date.parse(currentValue) : 0;
  if (Date.now() - last < LAST_SEEN_REFRESH_MS) return;

  const { error } = await supabase
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) console.warn("Impossible de rafraîchir la dernière activité :", error.message);
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function getSessionUserId(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

// Renvoie l'utilisateur courant (sans le hash de mot de passe), ou null si
// aucune session valide. Utilisable depuis les Server Components et Server
// Actions.
export async function getCurrentUser(): Promise<Profile | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("id, name, role, color, password_set, created_at, last_login_at")
    .eq("id", userId)
    .maybeSingle();

  if (!data) return null;

  await touchLastSeen(supabase, userId, (data.last_login_at as string | null) ?? null);

  const { last_login_at: _lastSeen, ...profile } = data;
  return profile as Profile;
}

import { createAdminClient } from "@/lib/supabase/admin";
import { getProfiles } from "@/lib/queries";
import { LoginForm } from "@/components/LoginForm";

// Cette page ne lit ni cookie ni en-tête : sans cette directive, Next.js la
// considère éligible à un rendu statique et fige la liste des profils (donc
// leur `password_set`) au moment du build. Résultat observé en production :
// après avoir défini son mot de passe, l'écran de connexion continuait de
// proposer le flux "première connexion" car il servait toujours l'ancien
// instantané. `force-dynamic` force une lecture fraîche de la table users à
// chaque affichage de l'écran de connexion.
export const dynamic = "force-dynamic";

// Page serveur : la liste des membres de la famille est lue via la clé
// service_role (aucune session n'existe encore à ce stade), afin de les
// afficher sur l'écran de connexion.
export default async function LoginPage() {
  const supabase = createAdminClient();
  const profiles = await getProfiles(supabase);

  return <LoginForm profiles={profiles} />;
}

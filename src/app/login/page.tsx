import { createAdminClient } from "@/lib/supabase/admin";
import { getProfiles } from "@/lib/queries";
import { LoginForm } from "@/components/LoginForm";

// Page serveur : la liste des membres de la famille est lue via la clé
// service_role (aucune session n'existe encore à ce stade), afin de les
// afficher sur l'écran de connexion.
export default async function LoginPage() {
  const supabase = createAdminClient();
  const profiles = await getProfiles(supabase);

  return <LoginForm profiles={profiles} />;
}

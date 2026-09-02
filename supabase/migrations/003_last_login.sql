-- Migration additive : ajoute la colonne "dernière connexion", utilisée par
-- le nouvel écran de statistiques admin (src/app/admin/page.tsx). Mise à
-- jour à chaque connexion réussie (connexion normale ou première connexion
-- avec définition du mot de passe) — voir recordLogin() dans
-- src/lib/auth.ts, appelée depuis loginAction et setPasswordAction
-- (src/lib/actions.ts).
--
-- Reste NULL pour les comptes qui ne se sont pas reconnectés depuis
-- l'application de cette migration : l'historique des connexions
-- antérieures n'a jamais été enregistré, donc "jamais connecté" n'est pas
-- forcément littéralement vrai pour ces comptes-là — juste "pas revenu
-- depuis ce déploiement".

alter table public.users
  add column if not exists last_login_at timestamptz;

# Checkberry

Application web responsive de gestion de tâches partagées en famille
(anciennement « To-Do List Familiale » ; dépôt toujours
`todolist-familiale`) — Next.js (App Router) + Neon (Postgres serverless)
+ Vercel (hébergement).

> **Envie de déployer sa propre instance pour sa propre famille ?** Voir
> [`docs/deploiement.md`](docs/deploiement.md) — guide pas à pas, aucune
> connaissance technique requise. Le reste de ce README s'adresse à
> quelqu'un qui développe sur le projet.

Ce dépôt est développé par Claude Code depuis une copie locale : lecture,
modification, vérification (`tsc`/`build`) et `git commit`/`push` directs
sur `main`, chaque push déclenchant un déploiement Vercel production (voir
"Développement local" ci-dessous et la doc technique §10). La base tournait
jusqu'au 11/09/2026 sur Supabase, migrée depuis vers Neon — voir
`docs/migration-neon.md` pour le détail.

## Pile technique

- **Next.js 14** (App Router, TypeScript, Tailwind CSS)
- **Neon** : Postgres serverless, connexion directe en SQL paramétré via
  `@neondatabase/serverless` (pas d'ORM, pas de query-builder) — voir
  "Schéma de base de données" ci-dessous
- **Vercel** : build et hébergement, déploiement continu sur chaque push

## Authentification

L'authentification est entièrement maison : une table `users` (voir
"Schéma de base de données" ci-dessous) stocke un prénom et un mot de passe
haché (algorithme scrypt, module `crypto` intégré à Node.js — aucune
dépendance externe). Next.js se connecte à Neon exclusivement côté serveur
avec la chaîne `DATABASE_URL`, en propriétaire de la base — aucune notion
de policy/Row Level Security à gérer côté Neon (l'appli n'est jamais
jointe depuis le navigateur).

La session est portée par un cookie HTTP-only contenant un JWT signé
(bibliothèque `jose`), vérifié dans le middleware Next.js (Edge runtime)
sans appel réseau à la base.

- **Connexion.** L'écran affiche les membres de la famille (prénom +
  avatar) ; on clique sur son profil puis on entre son mot de passe.
- **Création de compte** : depuis l'application, avec un compte
  administrateur → onglet **Admin → « Membres » → « Ajouter un membre »**
  (prénom, rôle, mot de passe temporaire généré). Voir la doc technique
  §6.9. Seul le tout premier administrateur est créé hors application
  (bootstrap ci-dessous).
- **Première connexion** : l'utilisateur choisit son profil, entre le mot
  de passe temporaire, puis définit immédiatement son propre mot de passe
  dans le même écran. `password_set` passe alors à `true`.
- **Changer son mot de passe** : soit depuis l'écran de connexion (lien
  "Changer mon mot de passe", après avoir choisi son profil), soit une fois
  connecté depuis l'écran "Mon compte" (clic sur son avatar). Les deux
  demandent le mot de passe actuel puis le nouveau.
- **Mot de passe oublié** : un administrateur clique « Réinitialiser le
  mot de passe » sur la fiche du membre (onglet « Membres ») — un nouveau
  mot de passe temporaire est généré et le membre retombe sur l'écran de
  première connexion.

### Bootstrap : premier compte administrateur

`db/neon_schema.sql` crée automatiquement un premier utilisateur `Admin`
avec le mot de passe temporaire **`bonjour2026`**. Se connecter avec ce
compte, définir immédiatement un mot de passe personnel via l'écran de
première connexion, puis créer les autres membres depuis l'onglet
**Admin → « Membres »**.

## Variables d'environnement

À définir dans Vercel (Project Settings → Environment Variables, voir
`.env.example`) :

```
DATABASE_URL=
SESSION_SECRET=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
CRON_SECRET=
```

`DATABASE_URL` est la chaîne de connexion **pooled** Neon (dashboard Neon
→ Connection Details, host en `...-pooler...`) — strictement secrète,
jamais exposée au navigateur. Une rotation du mot de passe Neon invalide
toute la chaîne (pas seulement le mot de passe isolé) : après une
rotation, toujours régénérer `DATABASE_URL` en entier depuis le dashboard
plutôt que de tenter un montage manuel.

`SESSION_SECRET` est une chaîne aléatoire longue à générer soi-même (ex.
`openssl rand -base64 48`) : elle signe les cookies de session, donc la
garder secrète et ne jamais la changer sans effet de bord (tout
changement déconnecte tous les utilisateurs).

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` sont la paire de clés
des notifications push web (protocole standard, aucun compte/service tiers
à créer) — à générer une fois avec `npx web-push generate-vapid-keys` et à
garder ensuite, ne pas régénérer (ça invaliderait tous les abonnements déjà
enregistrés). `VAPID_SUBJECT` est un contact `mailto:...` transmis au
service push en cas de souci de délivrabilité, jamais affiché aux
utilisateurs. `CRON_SECRET` protège la route de rappel d'échéance
(`/api/cron/reminders`, voir `vercel.json`) — Vercel Cron l'ajoute
automatiquement en en-tête `Authorization` à ses appels dès que cette
variable est définie sur le projet ; à générer une fois
(ex. `openssl rand -base64 32`). Toutes en type **Secret**, sauf
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` qui doit rester en clair (le préfixe
`NEXT_PUBLIC_` l'expose intentionnellement au navigateur).

## Schéma de base de données

Structure complète et à jour : `db/neon_schema.sql` — **à jour de toutes
les migrations** (voir la documentation technique §5.3) : un déploiement
neuf n'a besoin que de ce seul script, exécuté une fois (SQL Editor Neon
ou `psql "$DATABASE_URL" -f db/neon_schema.sql`) ; `db/migrations/`
(scripts additifs numérotés) ne sert qu'à faire évoluer une base **déjà
déployée**, une par une au fil des mises à jour du code, pas pour un
premier déploiement. Tables : `users`, `tasks`, `task_assignees` (partage
multiple, avec rôle), `comments`, `categories`, `app_settings`,
`tags`/`task_tags`, `checklist_items`, `activity_log`,
`user_activity_log` (streak personnel), `reward_tiers`,
`challenge_results`, `reward_achievements` (paliers de récompense),
`garden_activities`, `garden_activity_assignees`,
`garden_activity_categories` (activités récurrentes du jardin),
`car_activities`, `car_activity_assignees` (activités récurrentes de la
voiture), `health_activities`, `health_activity_assignees` (activités
récurrentes de santé), `finances_activities`,
`finances_activity_assignees` (activités récurrentes de finances),
`ideas` (boîte à idées), `notifications`, `push_subscriptions`.
Aucune notion de policy/Row Level Security côté Neon : l'application se
connecte en propriétaire de la base (`DATABASE_URL`) ; la visibilité
partagée/privée est appliquée entièrement au niveau applicatif
(`src/lib/access.ts`).

## Fonctionnement

- Toute nouvelle tâche est assignée automatiquement à son créateur.
- Une tâche récurrente clôturée ("Terminée") régénère automatiquement la
  prochaine occurrence avec les mêmes assignations.
- Visibilité privée par défaut, partage explicite par personne avec un
  rôle (assigné / lecture seule) — filtré côté application.
- Écran d'accueil : deux fils distincts — « À ton attention » (ce qui te
  concerne et attend peut-être une action, notifié) et « Activité du
  jour » (ce que fait la famille) — plus « Partagées avec toi » (les
  tâches où tu es en lecture seule). Notifications push web (opt-in par
  appareil, écran « Mon compte ») + rappel d'échéance quotidien (Vercel
  Cron, veille + jour même — pas de rappel « 1h avant », Vercel Hobby ne
  permettant qu'un déclenchement par jour). Voir la doc technique §6.15 et
  §6.16.
- Export d'une tâche datée vers le calendrier de l'appareil (fichier
  `.ics`). Voir §6.13.
- Gamification (12/09/2026, en test) : streak personnel (jours actifs
  consécutifs, une grâce par semaine) affiché sur l'accueil, « Mon
  compte » et l'onglet Membres de l'admin, plus une carte « Défi de la
  semaine » sur l'accueil (objectif familial hebdomadaire calculé sur les
  tâches partagées). Voir la doc technique §6.17.
- Paliers de récompense (12/09/2026) : seuils configurables par l'admin
  (onglet Admin → « Récompenses ») sur le streak personnel ou les défis
  familiaux réussis cumulés, chacun associé à une récompense en texte
  libre négociée en famille (pas de monnaie virtuelle). Suivi en
  attente/donné géré par l'admin ; affiché sur l'accueil une fois atteint.
  Voir la doc technique §6.18.
- Menu **Agendas** (13/09/2026, `/agendas`) : regroupe les onglets Jardin,
  Voiture, Santé et Finances (liens de menu remplaçant l'ancien lien
  direct « Jardin »). Chacun a un lien retour vers `/agendas` en tête de
  page.
- Onglet Jardin (13/09/2026) : activités récurrentes du jardin (taille,
  semis, plantation…), classées par mois avec un ou plusieurs
  responsables. Créer/modifier une activité crée/met à jour
  automatiquement la tâche de sa prochaine période ; clôturer ou
  supprimer cette tâche génère automatiquement celle de la période
  suivante. Catégories d'activités (Taille/Semis/Plantation/Autre)
  gérables depuis Admin → « Catégories », indépendantes des catégories de
  tâches. Voir la doc technique §6.19.
- Onglet Voiture (13/09/2026) : activités récurrentes d'entretien de la
  voiture (entretien, révision, contrôle technique, lavage…) — chaque
  activité est une instance datée avec sa propre récurrence par
  intervalle (jours/semaines/mois/années), triée chronologiquement.
  Clôturer l'activité crée automatiquement l'occurrence suivante. Une
  seule catégorie de tâche fixe (« Voiture »), pas de gestion de
  catégories dédiée. Voir la doc technique §6.20.
- Onglet Santé (13/09/2026) : même principe que Voiture (visites
  médicales, dentiste, vaccins…). Voir la doc technique §6.21.
- Onglet Finances (13/09/2026) : même principe que Voiture/Santé (impôts,
  assurances, abonnements…), icône € dédiée. Voir la doc technique §6.23.
- Mode hors ligne — lecture seule (13/09/2026) : les pages déjà visitées
  en ligne restent consultables sans connexion (bandeau « Hors ligne —
  dernières données à HH:mm »), avec une page de secours pour une route
  jamais visitée. Aucune écriture hors ligne. Voir la doc technique §6.22.
- Bascule tâche → agenda dédié (13/09/2026) : créer une tâche en
  catégorie Jardin/Voiture/Santé/Finances propose de créer plutôt une
  activité dans l'agenda correspondant, en reprenant la saisie déjà
  faite (titre, description, échéance, récurrence). Voir la doc
  technique §6.24.
- Accueil — « Prochaines tâches à faire » (13/09/2026) : liste des 3
  tâches ouvertes les plus proches dans le temps, affichée sous les
  compteurs. La tuile « Dues cette semaine » bascule sur la semaine
  suivante dès le dimanche (le reliquat de la semaine en cours est déjà
  compté dans « Aujourd'hui »). Voir la doc technique §6.6 et §6.25.
- Activation/désactivation des agendas (14/09/2026) : l'admin peut
  désactiver Jardin/Voiture/Santé/Finances individuellement (onglet Admin
  → « Réglages »). Un agenda désactivé disparaît du menu (menu « Agendas »
  masqué si les 4 sont désactivés) ; ses activités et les tâches classées
  dans sa catégorie restent en base mais ne sont plus affichées tant qu'il
  est désactivé. Voir la doc technique §6.26.
- Aide contextuelle par écran (14/09/2026) : un bouton « ? » en haut à
  droite de chaque écran principal (Accueil, Tâches, Agendas, Jardin,
  Voiture, Santé, Finances, Mon compte, Admin, et les trois écrans de
  tâche) ouvre une bulle expliquant son fonctionnement, sans quitter la
  page. Dans Admin, le contenu dépend de l'onglet ouvert. Voir la doc
  technique §6.27.
- Tags — garde-fous anti-doublons (17/09/2026) : impossible de créer un
  tag `#montag` (le `#` de tête tapé par erreur est retiré) ; à la
  création d'un tag à l'orthographe proche d'un tag existant (faute de
  frappe, pluriel...), une boîte propose de réutiliser l'un des tags
  proches plutôt que d'en créer un quasi-doublon. Admin → « Catégories »
  permet aussi de supprimer un tag ou d'en fusionner deux (les tâches du
  premier basculent sur le second). Voir la doc technique §6.4 et §6.9.
- Checklist — gestion déplacée dans le formulaire de tâche (17/09/2026) :
  ajouter/renommer/supprimer un item se fait depuis la création/édition de
  la tâche, juste sous la description ; l'écran de détail ne permet plus
  que de cocher/décocher. Voir la doc technique §6.10.
- Checklist dans les activités d'agenda (22/09/2026) : les activités de
  Jardin/Voiture/Santé/Finances peuvent porter une checklist, avec le même
  fonctionnement que pour une tâche — gestion complète dans le formulaire
  de l'activité, coche/décoche depuis la liste. Transmise à la tâche
  générée ; repart non cochée à chaque nouvelle occurrence. Voir la doc
  technique §6.28.
- Onglet Idées (22/09/2026, `/idees`) : boîte à idées familiale — à
  l'image de la fonctionnalité équivalente sur mabedetheque (autre projet
  de l'utilisateur), adaptée au modèle multi-utilisateur de cette appli.
  Formulaire de saisie libre, filtre et changement de statut (Proposée /
  En cours / Réalisée), suppression avec confirmation ; ouvert à toute la
  famille, pas réservé à l'admin. Accessible depuis le bandeau supérieur
  sur desktop et depuis « Mon compte » sur mobile (pas dans la barre
  d'onglets du bas, déjà pleine). Voir la doc technique §6.29.
- Toutes les heures sont gérées en fuseau **Europe/Paris**. Voir §8.1.
- Sur mobile : navigation par une barre d'onglets en bas d'écran
  (Accueil · Tâches · Agendas · Compte · Créer) et « tirer pour
  rafraîchir » ; sur desktop, navigation par le bandeau supérieur. Suite
  d'améliorations UX du 10/09/2026 (24 constats) : voir §6.16.

## Ce qui n'est pas encore implémenté

- Offline-first réel (file d'attente IndexedDB + réconciliation à la
  reconnexion pour les mutations créées hors ligne) — le service worker
  gère l'app shell, les notifications push et, depuis le 13/09/2026, la
  **consultation** hors ligne des pages déjà visitées (voir plus haut),
  mais aucune écriture hors ligne.

## Développement local

C'est le flux de travail retenu pour ce projet (voir doc technique §10) :
Claude Code travaille sur une copie locale du dépôt, `git commit`/`push`
directement sur `main` — chaque push déclenche un déploiement Vercel
production, la vérification (voir ci-dessous) se fait donc *avant* de
pousser.

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs (voir "Variables d'environnement")
npm run dev
```

Avec `DATABASE_URL` renseignée, `npm run dev` fonctionne contre la vraie
base Neon (pas de base de dev séparée). Avant de pousser sur `main` :
`npx tsc --noEmit` puis `npm run build` — tuer `next dev` avant le build
(les deux écrivent dans `.next`, qui peut se corrompre sinon).

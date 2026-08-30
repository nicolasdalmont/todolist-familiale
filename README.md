# To-Do List Familiale

Application web responsive de gestion de tâches partagées en famille —
Next.js (App Router) + Supabase (base de données, authentification, RLS) +
Vercel (hébergement).

Ce dépôt a été écrit et poussé directement par Claude depuis une session
cloud (pas de clone local dans le flux de travail retenu pour ce projet) —
voir le guide de mise en route (GitHub / Supabase / Vercel) partagé en
artifact dans la conversation pour le détail des étapes.

## Pile technique

- **Next.js 14** (App Router, TypeScript, Tailwind CSS)
- **Supabase** : Postgres + Auth (email/mot de passe) + Row Level Security
- **Vercel** : build et hébergement, déploiement continu sur chaque push

## Variables d'environnement

À définir dans Vercel (Project Settings → Environment Variables), voir
`.env.example` :

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Ces deux valeurs viennent de Supabase → Project Settings → API. La clé
`anon` est publique par conception (RLS protège les données, pas la clé) —
ne jamais utiliser la clé `service_role` ici.

## Schéma de base de données

Voir `supabase/schema.sql` — tables `profiles`, `tasks`, `task_assignees`
(assignation multiple), `comments`, avec les policies RLS garantissant
qu'une tâche privée reste invisible aux autres utilisateurs.

## Fonctionnement

- L'administrateur crée les comptes depuis Supabase (Authentication →
  Users → Invite) ; chaque utilisateur définit ensuite son mot de passe.
- Toute nouvelle tâche est assignée automatiquement à son créateur.
- Une tâche récurrente clôturée ("Terminée") régénère automatiquement la
  prochaine occurrence avec les mêmes assignations.
- Visibilité partagée (visible par tous) ou privée (visible uniquement par
  le créateur), appliquée au niveau base de données via RLS — pas
  seulement dans l'interface.

## Ce qui n'est pas encore implémenté

Conformément au phasage du cahier des charges, restent à construire :

- Offline-first réel (file d'attente IndexedDB + réconciliation à la
  reconnexion) — le service worker actuel ne fait que mettre en cache
  l'app shell.
- Notifications Web Push et App Badge (nécessitent des clés VAPID et une
  fonction serveur d'envoi).
- Interface d'administration pour la création de comptes (actuellement
  faite depuis le tableau de bord Supabase).

## Développement local (optionnel)

Le flux de travail retenu pour ce projet ne repose pas sur une copie
locale — Claude committe et pousse directement depuis sa session cloud.
Si tu veux malgré tout lancer le projet en local (ex : sur une machine
ayant accès à npm) :

```bash
npm install
cp .env.example .env.local   # puis renseigner les deux valeurs Supabase
npm run dev
```

# To-Do List Familiale — Prototype

Prototype cliquable de l'application décrite dans le cahier des charges
(v2.0), construit en HTML/CSS/JavaScript **sans framework ni dépendance
externe** afin de pouvoir tourner immédiatement, sans étape de build.

## Pourquoi pas directement Next.js / Supabase ici ?

L'environnement cloud de cette session n'a pas accès au registre npm
(politique réseau de l'organisation), donc impossible d'installer Next.js,
React, etc. ici. Ce prototype vanilla JS sert donc de **maquette
fonctionnelle** : il permet de valider les parcours et l'ergonomie tout de
suite, et sert de référence pour l'implémentation finale en
Next.js + Supabase + déploiement Vercel/GitHub (comme pour Calyxter Set
Manager), qui pourra se faire sur ta machine ou dans un environnement ayant
accès à npm.

## Lancer le prototype

Un service worker est enregistré pour l'installabilité PWA : cela ne
fonctionne pas en ouvrant le fichier directement (`file://`), il faut un
petit serveur local. Depuis ce dossier :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

ou avec Node (si `npx serve` est disponible sur ta machine) :

```bash
npx serve .
```

Une fois ouvert dans Chrome/Edge, l'icône d'installation (⊕ dans la barre
d'adresse) permet d'installer l'app sur le bureau ou l'écran d'accueil.

## Ce qui est implémenté dans ce prototype

- Sélection de profil (mock d'authentification — 4 utilisateurs pré-remplis,
  dont un administrateur).
- Tableau de bord des tâches avec filtres (Toutes / Mes tâches / Partagées /
  Privées / Terminées / Archivées).
- Création / édition de tâche : titre, description, échéance, récurrence
  (quotidienne, hebdomadaire, mensuelle, personnalisée), assignation
  multiple, visibilité partagée/privée.
- Assignation automatique de toute nouvelle tâche à son créateur.
- Cycle de statut (À faire / En cours / Terminée / Archivée) avec
  régénération automatique d'une tâche récurrente à sa clôture.
- Fil de commentaires horodatés par tâche.
- Design mobile-first, responsive.
- Manifest + service worker basique : app installable, cache de l'app shell.

## Ce qui n'est volontairement pas fait ici (prototype uniquement)

Ces points sont prévus dans le cahier des charges mais nécessitent une vraie
API/BDD et seront à construire lors de l'implémentation finale (Phases 2 à
4) :

- Authentification réelle (hachage de mot de passe, session
  chiffrée/JWT) — remplacée ici par une simple sélection de profil.
- Persistance partagée entre utilisateurs : les données sont stockées en
  `localStorage`, donc **locales à ce navigateur** (pas de synchronisation
  réelle entre appareils — ce sera le rôle de Supabase).
- Synchronisation offline avancée (file d'attente IndexedDB + réconciliation
  au retour du réseau) : le prototype fonctionne hors-ligne car tout est
  déjà local, mais le vrai moteur de sync reste à construire avec le
  backend.
- Notifications Web Push et App Badge (nécessitent un backend et des clés
  VAPID).
- Interface d'administration complète (création de comptes par
  l'administrateur) — un stub minimal seulement.

## Structure du projet

```
todolist-familiale/
├── index.html
├── manifest.json
├── sw.js                     # service worker (cache app shell)
├── css/styles.css
├── icons/                    # icônes PWA générées (192/512)
├── js/
│   ├── app.js                 # routeur (hash-based) + bootstrap
│   ├── store.js                # "faux backend" localStorage, calqué sur
│   │                            # le futur schéma Supabase
│   ├── helpers.js
│   └── views/
│       ├── login.js
│       ├── dashboard.js
│       ├── task-form.js
│       └── task-detail.js
└── scripts/                   # scripts utilitaires (icônes, captures d'écran)
```

Le schéma de données dans `js/store.js` est volontairement pensé pour
correspondre à ce que seront les tables Postgres/Supabase :
`users`, `tasks`, `task_assignees` (relation d'assignation multiple),
`comments`. Cela doit faciliter la reprise en Next.js + Supabase.

## Prochaines étapes suggérées

1. Valider ce prototype (parcours, ergonomie, champs) avant de coder le
   "vrai" backend.
2. Créer le projet Supabase (base Postgres + Auth + Row Level Security pour
   la visibilité privée/partagée) et le repo GitHub, connecté à Vercel
   (comme pour Calyxter Set Manager).
3. Réimplémenter l'interface en Next.js (App Router) en réutilisant ce
   prototype comme référence UX, en branchant Supabase Auth et la base de
   données à la place du `store.js` local.
4. Ajouter Service Worker avancé + IndexedDB pour l'offline-first réel, puis
   Web Push / App Badge.

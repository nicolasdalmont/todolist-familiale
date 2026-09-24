# Checkberry — Déployer sa propre instance

Guide pas à pas pour installer **sa propre copie indépendante** de
Checkberry (une famille = une instance = une base de données séparée),
sans rien installer sur son ordinateur — tout se fait dans le navigateur,
avec trois comptes gratuits (GitHub, Neon, Vercel). Ce guide ne suppose
aucune connaissance en programmation ; suivre les étapes dans l'ordre,
sans en sauter.

**Durée** : compter 30 à 45 minutes, en une seule fois si possible.

**Ce qu'on obtient à la fin** : une adresse du type
`https://mon-projet.vercel.app` (ou un nom de domaine personnel si on en
ajoute un plus tard), avec un compte administrateur permettant de créer
les comptes du reste de la famille depuis l'application elle-même — plus
aucune étape technique après ça.

> Pour la suite (développer, modifier le code, comprendre comment
> l'application fonctionne en détail), voir [`README.md`](../README.md)
> et [`documentation-technique.md`](documentation-technique.md) — ce
> guide-ci ne couvre que l'installation initiale.

---

## Vue d'ensemble

Quatre étapes, dans cet ordre :

1. **Copier le projet** dans son propre compte GitHub (« fork »).
2. **Créer la base de données** (Neon, gratuit) et y charger la
   structure.
3. **Générer quelques codes secrets** (une seule fois, via un terminal
   temporaire ouvert dans le navigateur — aucune installation).
4. **Créer le site** (Vercel, gratuit) branché sur sa copie GitHub, avec
   les secrets de l'étape 3 et l'adresse de la base de l'étape 2.

Puis une première connexion dans l'application pour créer son mot de
passe et les comptes du reste de la famille.

---

## Étape 1 — Copier le projet sur GitHub (« fork »)

Un *fork* est une copie complète du projet dans son propre compte, sur
laquelle on a la main entière (rien à voir avec l'original ensuite).

1. Créer un compte gratuit sur [github.com](https://github.com) si on
   n'en a pas déjà un (bouton « Sign up », une adresse email suffit).
2. Se rendre sur la page du projet :
   [github.com/nicolasdalmont/todolist-familiale](https://github.com/nicolasdalmont/todolist-familiale).
3. Cliquer sur le bouton **Fork** en haut à droite de la page.
4. Sur l'écran suivant, laisser les réglages par défaut (propriétaire =
   son propre compte, nom du dépôt inchangé) et cliquer **Create fork**.
5. Au bout de quelques secondes, on arrive sur sa propre copie, à
   l'adresse `github.com/<son-nom-d'utilisateur>/todolist-familiale`.
   **C'est cette adresse-là qu'on utilisera à partir de maintenant**, pas
   celle de l'étape 2.

Le dépôt peut rester public ou passer en privé (`Settings` → tout en bas
→ `Change visibility`) selon préférence — aucune donnée sensible n'y est
stockée (les mots de passe et clés de l'étape 3/4 ne sont jamais mis dans
le code, uniquement dans Vercel, voir étape 4).

---

## Étape 2 — Créer la base de données (Neon)

1. Créer un compte gratuit sur [neon.tech](https://neon.tech) — le
   bouton « Sign up with GitHub » est pratique, il réutilise le compte de
   l'étape 1.
2. Créer un nouveau projet (« New Project ») :
   - Nom au choix (ex. `checkberry`).
   - Région : la plus proche de la famille (ex. « Europe (Frankfurt) »
     pour la France).
   - Version Postgres : garder la valeur par défaut proposée.
   - Cliquer **Create Project**.
3. Une fois le projet créé, ouvrir l'éditeur SQL : dans le menu de
   gauche, **SQL Editor**.
4. Aller chercher le contenu du script de structure sur son propre
   dépôt GitHub (celui de l'étape 1) : ouvrir
   `github.com/<son-nom-d'utilisateur>/todolist-familiale/blob/main/db/neon_schema.sql`,
   cliquer sur l'icône **Copy raw file** (ou sélectionner tout le texte
   affiché et le copier).
5. Revenir dans le **SQL Editor** de Neon, coller le script dans la zone
   de saisie, puis cliquer **Run**.
6. Vérifier qu'il n'y a pas de message d'erreur en rouge — le résultat
   attendu est une suite de confirmations (`CREATE TABLE`, `INSERT 0 1`,
   etc.). Si une erreur apparaît, ne pas continuer : relire le message
   (souvent un copier-coller incomplet du script) avant de réessayer.
7. Récupérer la chaîne de connexion : menu de gauche **Dashboard** (ou
   **Connection Details** selon la version de l'interface), puis dans
   l'encart de connexion :
   - Vérifier que le sélecteur est bien sur **Pooled connection** (pas
     « Direct connection »).
   - Copier la chaîne affichée (elle commence par `postgresql://` et
     contient `-pooler` dans le nom d'hôte).
   - La garder de côté pour l'étape 4 (variable `DATABASE_URL`) — c'est
     un secret, à ne jamais coller ailleurs que dans Vercel.

---

## Étape 3 — Générer les secrets (une seule fois)

L'application a besoin de quelques codes aléatoires générés une seule
fois à l'installation. Le plus simple, sans rien installer sur son
ordinateur : un terminal temporaire ouvert directement depuis GitHub
(**Codespaces**, inclus gratuitement dans une limite mensuelle largement
suffisante pour les quelques minutes nécessaires ici).

1. Sur son propre dépôt GitHub (celui de l'étape 1), cliquer sur le
   bouton vert **Code**, onglet **Codespaces**, puis **Create codespace
   on main**.
2. Attendre le chargement (une trentaine de secondes) : un éditeur de
   code s'ouvre dans le navigateur, avec un terminal en bas de l'écran
   (sinon : menu **Terminal** → **New Terminal**).
3. Dans ce terminal, taper la commande suivante puis Entrée :

   ```bash
   openssl rand -base64 48
   ```

   Copier le résultat affiché — ce sera la variable `SESSION_SECRET` à
   l'étape 4.
4. Relancer la **même commande une seconde fois** (elle génère à chaque
   fois une valeur différente) :

   ```bash
   openssl rand -base64 48
   ```

   Copier ce second résultat — ce sera `CRON_SECRET`.
5. Taper ensuite :

   ```bash
   npx web-push generate-vapid-keys
   ```

   (la première exécution télécharge l'outil, ça prend quelques
   secondes). Le résultat donne deux valeurs : **Public Key** et
   **Private Key** — les garder toutes les deux de côté, elles serviront
   respectivement à `NEXT_PUBLIC_VAPID_PUBLIC_KEY` et
   `VAPID_PRIVATE_KEY`.
6. On a maintenant 4 valeurs notées de côté (`SESSION_SECRET`,
   `CRON_SECRET`, la clé publique et la clé privée VAPID), en plus de la
   chaîne `DATABASE_URL` de l'étape 2. Le codespace n'est plus utile :
   on peut le fermer (onglet du navigateur) — il s'arrête tout seul après
   un moment d'inactivité, rien à nettoyer.

> Ces quatre commandes ne font que générer des nombres aléatoires et ne
> touchent ni au code ni à aucune base de données — aucun risque à les
> lancer.

---

## Étape 4 — Créer le site (Vercel)

1. Créer un compte gratuit sur [vercel.com](https://vercel.com) — là
   aussi, « Continue with GitHub » est le plus simple (même compte que
   l'étape 1).
2. Sur le tableau de bord, cliquer **Add New...** → **Project**.
3. Vercel demande l'autorisation d'accéder à GitHub : accepter, puis
   choisir soit tous les dépôts soit seulement `todolist-familiale`
   (recommandé) dans la fenêtre d'autorisation GitHub.
4. Dans la liste des dépôts proposés, retrouver `todolist-familiale`
   (celui de son propre compte, étape 1) et cliquer **Import**.
5. Vercel détecte automatiquement qu'il s'agit d'un projet Next.js — ne
   rien changer dans les réglages de build.
6. **Avant de cliquer sur Deploy**, déplier la section **Environment
   Variables** et ajouter, une par une (nom exact à gauche, valeur notée
   pendant les étapes 2 et 3 à droite) :

   | Nom | Valeur |
   |---|---|
   | `DATABASE_URL` | la chaîne `postgresql://...-pooler...` de l'étape 2 |
   | `SESSION_SECRET` | le 1er résultat `openssl rand -base64 48` |
   | `CRON_SECRET` | le 2e résultat `openssl rand -base64 48` |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | la « Public Key » de `web-push generate-vapid-keys` |
   | `VAPID_PRIVATE_KEY` | la « Private Key » de `web-push generate-vapid-keys` |
   | `VAPID_SUBJECT` | `mailto:` suivi de son adresse email (ex. `mailto:prenom@exemple.fr`) |

   Deux variables **facultatives**, à n'ajouter que si on veut changer
   le nom affiché ou le fuseau horaire par défaut :

   | Nom | Valeur |
   |---|---|
   | `NEXT_PUBLIC_APP_NAME` | nom affiché dans l'application (par défaut `Checkberry`) |
   | `NEXT_PUBLIC_APP_TIMEZONE` | fuseau horaire IANA (par défaut `Europe/Paris`) |

7. Cliquer **Deploy**. Le premier déploiement prend une à deux minutes
   (une barre de progression s'affiche) ; à la fin, Vercel affiche un
   aperçu et l'adresse du site, du type
   `https://todolist-familiale-xxxx.vercel.app`.

   Si le déploiement échoue (écran rouge « Build Failed »), la cause la
   plus fréquente est une variable d'environnement manquante ou mal
   collée (espace en trop, valeur tronquée) — vérifier le tableau
   ci-dessus dans **Project → Settings → Environment Variables**, puis
   relancer un déploiement depuis l'onglet **Deployments** (bouton
   **Redeploy**).

---

## Étape 5 — Première connexion

1. Ouvrir l'adresse `https://....vercel.app` obtenue à l'étape
   précédente.
2. Sur l'écran de connexion, choisir le profil **Admin**.
3. Mot de passe temporaire : **`bonjour2026`**.
4. L'application demande aussitôt de définir un nouveau mot de passe
   personnel — le choisir et valider.
5. Aller dans **Admin → Membres → Ajouter un membre** pour créer un
   compte par personne de la famille (prénom, rôle, mot de passe
   temporaire généré automatiquement à leur communiquer) — voir
   `README.md` section « Authentification » pour le détail du
   fonctionnement (première connexion, mot de passe oublié, etc.).

L'installation est terminée à ce stade : tout le reste (catégories,
agendas Jardin/Voiture/Santé/Finances, notifications, réglages) se
configure depuis l'application, onglet **Admin**.

---

## Vérifications rapides

- **Créer une tâche** depuis l'écran d'accueil : doit s'afficher
  immédiatement dans « Tâches ».
- **Notifications** : depuis « Mon compte », activer les notifications
  sur son appareil — si ça échoue silencieusement, revérifier les trois
  variables VAPID (nom exact, pas d'espace ni de retour à la ligne collé
  par erreur) dans Vercel, puis **Redeploy**.
- **Rappel quotidien** : visible dans Vercel sous **Project → Settings →
  Cron Jobs** (une entrée `/api/cron/reminders`, une fois par jour — le
  plan gratuit Vercel n'autorise qu'un déclenchement par jour, c'est
  normal et déjà pris en compte par l'application).

---

## Dépannage

| Symptôme | Cause probable |
|---|---|
| Build Vercel en échec | Variable d'environnement manquante/mal collée — voir étape 4, point 7 |
| Page blanche ou erreur 500 à l'ouverture du site | `DATABASE_URL` incorrecte, ou script `neon_schema.sql` non exécuté (revoir étape 2) |
| Impossible de se connecter avec Admin / bonjour2026 | Le script SQL n'a pas été exécuté jusqu'au bout (relire le résultat du **Run** dans Neon, étape 2, point 6) |
| Les notifications ne s'activent jamais | Clés VAPID absentes ou mal copiées ; sinon, autorisation refusée dans le navigateur/téléphone |
| Pas de rappel reçu | Normal si moins de 24h depuis le déploiement (un seul passage par jour, 7h heure de Paris — voir `vercel.json`) |

Pour toute autre question sur le fonctionnement de l'application une
fois installée, voir `README.md` (vue d'ensemble) et
`documentation-technique.md` (détail par fonctionnalité).

---

## Et après ?

- **Nom de domaine personnalisé** (optionnel) : **Project → Settings →
  Domains** dans Vercel, pour remplacer `....vercel.app` par un domaine
  qu'on possède déjà.
- **Mises à jour** : ce guide crée une copie indépendante du projet
  (le *fork* de l'étape 1) — les évolutions faites plus tard sur le
  projet d'origine ne s'appliquent pas automatiquement à sa copie. Pour
  les récupérer : sur la page GitHub de son propre dépôt, bouton **Sync
  fork** → **Update branch**, ce qui déclenche automatiquement un
  nouveau déploiement Vercel. Pour toute évolution du schéma de base
  (nouvelles fonctionnalités), il faudra alors aussi rejouer à la main
  les fichiers numérotés apparus depuis dans `db/migrations/` (SQL
  Editor Neon, un par un, dans l'ordre) — voir `README.md`.

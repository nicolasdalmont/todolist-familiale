export type Role = "admin" | "user";
export type TaskStatus = "todo" | "in_progress" | "done" | "archived";
export type Visibility = "shared" | "private";
// "editor" : voit, modifie, change le statut et commente une tâche.
// "viewer" : voit et commente, sans pouvoir la modifier. Voir
// src/lib/access.ts pour les règles de contrôle d'accès associées.
export type ShareRole = "editor" | "viewer";
export type RecurrenceType = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
// Une catégorie de tâche — depuis la migration 009, elles vivent en base
// (table `categories`) et sont gérables depuis l'écran admin. `slug` est
// la clé stable stockée dans `tasks.category` ; `icon` est un nom choisi
// parmi CATEGORY_ICON_CHOICES (src/lib/categories.ts).
export interface Category {
  slug: string;
  label: string;
  icon: string;
  position: number;
}

export interface Recurrence {
  type: RecurrenceType;
  interval?: number;
  unit?: "days" | "weeks" | "months";
}

// Représente une ligne de la table "users". Ne contient jamais
// password_hash : ce champ reste confiné au code serveur d'authentification
// (src/lib/auth.ts) et n'est jamais sélectionné dans les requêtes qui
// alimentent l'interface (voir src/lib/queries.ts).
export interface Profile {
  id: string;
  name: string;
  role: Role;
  color: string;
  // false tant que l'utilisateur n'a pas remplacé le mot de passe temporaire
  // donné par l'administrateur par son propre mot de passe.
  password_set: boolean;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
}

// Réglages d'instance (table `app_settings`, une ligne — migration 010).
// Voir getAppSettings() dans src/lib/queries.ts et l'onglet « Réglages »
// de l'écran admin.
export interface AppSettings {
  reminderEnabled: boolean;
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: Profile | null;
}

// Item d'une checklist de tâche (sous-tâche à cocher) — voir
// src/components/ChecklistSection.tsx et migration 004_checklist.sql.
export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  due_at: string | null;
  recurrence: Recurrence;
  status: TaskStatus;
  visibility: Visibility;
  // Slug de catégorie (voir Category / table `categories`).
  category: string;
  created_by: string;
  created_at: string;
  // Personnes avec qui la tâche est partagée (le créateur n'y figure pas
  // forcément dans ce tableau côté type, mais l'est toujours en base — voir
  // src/lib/access.ts). Chaque entrée porte son rôle de partage
  // (`shareRole`, à ne pas confondre avec `Profile.role`, le rôle de
  // compte admin/user de la personne).
  assignees?: Array<Omit<Profile, "role"> & { role: ShareRole }>;
  tags?: Tag[];
  // Sous-tâches à cocher, dans l'ordre de création. Absent ou vide : pas de
  // checklist pour cette tâche — TaskCard.tsx n'affiche alors aucun
  // indicateur d'avancement.
  checklist?: ChecklistItem[];
  // Nombre de commentaires sur la tâche (agrégat `comments(count)` de
  // getTasks/getTask, voir src/lib/queries.ts). Affiché sur la carte de
  // tâche s'il est > 0.
  commentCount?: number;
}

// Type d'événement du journal d'activité (voir migration
// 005_activity_log.sql et src/lib/actions.ts, fonction logActivity) — sert
// aussi de clé de gabarit de message dans src/components/ActivityFeed.tsx.
export type ActivityType =
  | "task_created"
  | "task_updated"
  | "status_changed"
  | "comment_added"
  | "comment_deleted"
  | "checklist_item_added"
  | "checklist_item_checked"
  | "checklist_item_unchecked"
  | "checklist_item_removed"
  | "due_date_changed";

// Une ligne du journal d'activité — voir getRecentActivity() dans
// src/lib/queries.ts. N'est jamais renvoyée que pour des tâches déjà
// vérifiées visibles par l'utilisateur courant (canView) ; `actor` est
// `null` si le compte de l'auteur a été supprimé depuis (colonne
// actor_id en "on delete set null").
export interface ActivityLogEntry {
  id: string;
  task_id: string;
  task_title: string;
  actor_id: string;
  type: ActivityType;
  detail: string | null;
  created_at: string;
  actor?: Pick<Profile, "id" | "name" | "color"> | null;
}

// Notification « À ton attention » (fil de l'écran d'accueil — voir
// src/components/AttentionFeed.tsx, src/lib/notifications.ts et migration
// 006_notifications.sql). `title` est une phrase prête à afficher ; `body`
// est un détail secondaire optionnel. `read_at` NULL = non lue.
export type NotificationType =
  | "task_shared"
  | "task_updated"
  | "task_deleted"
  | "comment_added"
  | "status_changed"
  | "due_soon"
  | "reward_achieved";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  task_id: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

// Statistiques par utilisateur, réservées à l'écran admin
// (src/app/admin/page.tsx) — voir getUserStats() dans src/lib/queries.ts.
// Les compteurs de tâches sont ventilés privé/partagé (sur le champ
// dérivé Task.visibility, voir access.ts) plutôt qu'un simple total, sur
// demande explicite de l'utilisateur.
// Un membre, pour l'onglet « Membres » de l'écran admin
// (src/components/UserManager.tsx) — voir getMembers() dans
// src/lib/queries.ts. Les compteurs servent à prévenir de ce qui sera
// supprimé avec le compte.
export interface Member {
  id: string;
  name: string;
  role: Role;
  color: string;
  password_set: boolean;
  created_at: string;
  lastSeenAt: string | null;
  createdTasks: number;
  sharedTasks: number;
  authoredComments: number;
  // Streak personnel (src/lib/streaks.ts), pour affichage seulement — ne
  // rentre pas dans les compteurs "ce qui sera supprimé" ci-dessus.
  streak: number;
}

export interface UserStats {
  id: string;
  name: string;
  color: string;
  // Dernière activité (dernier rendu de page authentifié), colonne
  // users.last_login_at — voir touchLastSeen() dans src/lib/auth.ts.
  // null : compte jamais vu depuis l'ajout du suivi (migration
  // 003_last_login.sql).
  lastSeenAt: string | null;
  totalPrivate: number;
  totalShared: number;
  weekPrivate: number;
  weekShared: number;
}

// Défis familiaux hebdomadaires — voir src/lib/challenges.ts (contenu +
// moteur d'évaluation) et src/components/ChallengeCard.tsx (affichage sur
// l'Accueil). Toujours calculés sur les tâches partagées uniquement, pour
// toute la famille (pas par utilisateur) : ce sont des défis collectifs.

// Une métrique de défi, en union discriminée par `kind`. `direction`
// précise le sens de la progression : "atLeast" (viser target ou plus,
// cas le plus courant) ou "atMost" (rester à target ou moins — ex. "0
// changement d'échéance").
export type ChallengeMetric =
  | { kind: "activity_count"; activityType: ActivityType; target: number; direction: "atLeast" | "atMost"; dedupeByTaskId?: boolean; matchDetail?: string }
  | { kind: "distinct_active_days"; activityType: ActivityType; target: number }
  | { kind: "zero_overdue_shared" }
  | { kind: "full_team_daily_completion"; target: number }
  | { kind: "combo"; metrics: ChallengeMetric[] };

export interface WeeklyChallenge {
  // Clé "YYYY-MM-DD" (lundi, jour civil à Paris) — voir mondayOfWeek()
  // dans src/lib/format.ts.
  weekStart: string;
  title: string;
  description: string;
  metric: ChallengeMetric;
}

// Résultat de l'évaluation d'une métrique — `current`/`target` sont
// toujours des compteurs positifs, `success` tient compte de `direction`
// (ex. current=0, target=0, direction="atMost" → success=true).
export interface ChallengeProgress {
  current: number;
  target: number;
  direction: "atLeast" | "atMost";
  success: boolean;
  label: string;
  // Sous-progressions, uniquement pour une métrique "combo" (une entrée
  // par sous-métrique, dans le même ordre).
  parts?: ChallengeProgress[];
}

// Paliers de récompense (migration 002, voir src/lib/rewards.ts) — un
// palier configuré par l'admin, sur le streak personnel (individuel) ou les
// défis familiaux réussis cumulés (collectif). La récompense elle-même est
// un texte libre saisi par l'admin, négociée en famille hors appli.
export type RewardScope = "individual" | "collective";
export type RewardMetric = "streak_days" | "challenges_completed";
export type RewardStatus = "pending" | "given";

export interface RewardTier {
  id: string;
  scope: RewardScope;
  metric: RewardMetric;
  threshold: number;
  rewardLabel: string;
  active: boolean;
}

// Un palier atteint, avec le nécessaire déjà joint pour l'affichage — voir
// getRewardAchievements() dans src/lib/queries.ts. `user` est `null` pour un
// palier collectif (toute la famille), sinon la personne qui l'a atteint.
export interface RewardAchievement {
  id: string;
  tier: Pick<RewardTier, "id" | "scope" | "metric" | "threshold" | "rewardLabel">;
  user: Pick<Profile, "id" | "name" | "color"> | null;
  achievedAt: string;
  status: RewardStatus;
  givenAt: string | null;
}

export type Role = "admin" | "user";
export type TaskStatus = "todo" | "in_progress" | "done" | "archived";
export type Visibility = "shared" | "private";
// "editor" : voit, modifie, change le statut et commente une tâche.
// "viewer" : voit et commente, sans pouvoir la modifier. Voir
// src/lib/access.ts pour les règles de contrôle d'accès associées.
export type ShareRole = "editor" | "viewer";
export type RecurrenceType = "none" | "daily" | "weekly" | "monthly" | "custom";
// Ordre volontairement alphabétique (reflète l'ordre d'affichage demandé) ;
// voir src/lib/categories.ts pour les libellés et icônes associés.
export type Category = "achats" | "autre" | "cadeaux" | "enfants" | "famille" | "maison" | "vacances";

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
  category: Category;
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
  | "checklist_item_removed";

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

// Statistiques par utilisateur, réservées à l'écran admin
// (src/app/admin/page.tsx) — voir getUserStats() dans src/lib/queries.ts.
// Les compteurs de tâches sont ventilés privé/partagé (sur le champ
// dérivé Task.visibility, voir access.ts) plutôt qu'un simple total, sur
// demande explicite de l'utilisateur.
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

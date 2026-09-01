export type Role = "admin" | "user";
export type TaskStatus = "todo" | "in_progress" | "done" | "archived";
export type Visibility = "shared" | "private";
export type RecurrenceType = "none" | "daily" | "weekly" | "monthly" | "custom";

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

export interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: Profile | null;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  due_at: string | null;
  recurrence: Recurrence;
  status: TaskStatus;
  visibility: Visibility;
  created_by: string;
  created_at: string;
  assignees?: Profile[];
}

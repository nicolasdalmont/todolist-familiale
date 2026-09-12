import { sql } from "./db";
import type {
  ActivityLogEntry,
  AppSettings,
  Category,
  ChecklistItem,
  Comment,
  Member,
  NotificationItem,
  Profile,
  ShareRole,
  Tag,
  Task,
  TaskStatus,
  UserStats,
} from "./types";
import { canEdit, canView } from "./access";
import { DEFAULT_CATEGORIES } from "./categories";
import { dateKeyFromDate, dateKeyFromIso, isOverdue } from "./format";
import { computeStreak } from "./streaks";

export async function getProfiles(): Promise<Profile[]> {
  const rows = await sql`
    select id, name, role, color, password_set, created_at from users order by name
  `;
  return rows as unknown as Profile[];
}

export async function getProfile(id: string): Promise<Profile | null> {
  const rows = await sql`
    select id, name, role, color, password_set, created_at from users where id = ${id}
  `;
  return (rows[0] as unknown as Profile) ?? null;
}

// Réglages d'instance (table `app_settings`, une ligne — migration 010).
// Tolère l'absence de la table (migration pas encore jouée) : rappel
// activé par défaut.
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const rows = await sql`select reminder_enabled from app_settings where id = 1`;
    const data = rows[0] as { reminder_enabled: boolean } | undefined;
    if (!data) return { reminderEnabled: true };
    return { reminderEnabled: data.reminder_enabled };
  } catch (e) {
    console.error("getAppSettings:", e instanceof Error ? e.message : e);
    return { reminderEnabled: true };
  }
}

// Catégories de tâches (table `categories`, migration 009). Petite table
// (une poignée de lignes) chargée telle quelle par les écrans qui en ont
// besoin : liste et détail des tâches, formulaires, onglet admin.
export async function getCategories(): Promise<Category[]> {
  try {
    const rows = (await sql`
      select slug, label, icon, position from categories order by position
    `) as unknown as Category[];
    return rows.length > 0 ? rows : DEFAULT_CATEGORIES;
  } catch (e) {
    // Table pas encore créée (migration 009) : on sert les catégories
    // historiques, l'appli reste fonctionnelle le temps de la migration —
    // même principe de tolérance que getRecentActivity().
    console.error("getCategories:", e instanceof Error ? e.message : e);
    return DEFAULT_CATEGORIES;
  }
}

export async function getTags(): Promise<Tag[]> {
  const rows = await sql`select id, name from tags order by name`;
  return rows as unknown as Tag[];
}

// Récupère l'id de chaque tag nommé, en créant ceux qui n'existent pas
// encore (utilisateur libre de taper un nouveau tag dans le formulaire).
// Les noms sont normalisés (espaces retirés, minuscules) pour éviter les
// doublons du type "Maison" / "maison".
export async function upsertTagIds(names: string[]): Promise<string[]> {
  const normalized = Array.from(
    new Set(names.map((n) => n.trim().toLowerCase()).filter((n) => n.length > 0))
  );
  if (normalized.length === 0) return [];

  await sql`
    insert into tags (name)
    select unnest(${normalized}::text[])
    on conflict (name) do nothing
  `;

  const rows = await sql`select id, name from tags where name = any(${normalized}::text[])`;
  return (rows as { id: string }[]).map((t) => t.id);
}

interface TaskBaseRow {
  id: string;
  title: string;
  description: string;
  due_at: string | null;
  recurrence: Task["recurrence"];
  status: Task["status"];
  visibility: Task["visibility"];
  category: string;
  created_by: string;
  created_at: string;
}

// Attache les ressources liées (assignés, tags, checklist, nombre de
// commentaires) à un lot de tâches — approche "N+1 borné" (voir
// docs/migration-neon.md §2.4) : une requête par relation, filtrée par
// `task_id = any(...)`, plutôt qu'une seule requête imbriquée avec
// jsonb_agg. Le volume familial (quelques dizaines de tâches au plus) rend
// cette approche largement suffisante et plus simple à relire/déboguer que
// du SQL dense.
async function attachRelations(tasks: TaskBaseRow[]): Promise<Task[]> {
  if (tasks.length === 0) return [];
  const ids = tasks.map((t) => t.id);

  const [assigneeRows, tagRows, checklistRows, commentRows] = await Promise.all([
    sql`
      select ta.task_id as task_id, ta.role as share_role,
             u.id as user_id, u.name as user_name, u.color as user_color,
             u.password_set as user_password_set, u.created_at as user_created_at
      from task_assignees ta
      join users u on u.id = ta.user_id
      where ta.task_id = any(${ids})
    `,
    sql`
      select tt.task_id as task_id, t.id as tag_id, t.name as tag_name
      from task_tags tt
      join tags t on t.id = tt.tag_id
      where tt.task_id = any(${ids})
    `,
    sql`
      select id, task_id, label, done, created_at
      from checklist_items
      where task_id = any(${ids})
      order by created_at
    `,
    sql`
      select task_id, count(*)::int as n
      from comments
      where task_id = any(${ids})
      group by task_id
    `,
  ]);

  const assigneesByTask = new Map<string, Task["assignees"]>();
  for (const row of assigneeRows as Array<{
    task_id: string;
    share_role: ShareRole;
    user_id: string;
    user_name: string;
    user_color: string;
    user_password_set: boolean;
    user_created_at: string;
  }>) {
    const list = assigneesByTask.get(row.task_id) ?? [];
    list!.push({
      id: row.user_id,
      name: row.user_name,
      color: row.user_color,
      password_set: row.user_password_set,
      created_at: row.user_created_at,
      role: row.share_role,
    });
    assigneesByTask.set(row.task_id, list);
  }

  const tagsByTask = new Map<string, Tag[]>();
  for (const row of tagRows as Array<{ task_id: string; tag_id: string; tag_name: string }>) {
    const list = tagsByTask.get(row.task_id) ?? [];
    list.push({ id: row.tag_id, name: row.tag_name });
    tagsByTask.set(row.task_id, list);
  }

  const checklistByTask = new Map<string, ChecklistItem[]>();
  for (const row of checklistRows as Array<ChecklistItem & { task_id: string }>) {
    const list = checklistByTask.get(row.task_id) ?? [];
    list.push({ id: row.id, label: row.label, done: row.done, created_at: row.created_at });
    checklistByTask.set(row.task_id, list);
  }

  const commentCountByTask = new Map<string, number>();
  for (const row of commentRows as Array<{ task_id: string; n: number }>) {
    commentCountByTask.set(row.task_id, row.n);
  }

  return tasks.map((base) => ({
    ...base,
    assignees: assigneesByTask.get(base.id) ?? [],
    tags: tagsByTask.get(base.id) ?? [],
    checklist: checklistByTask.get(base.id) ?? [],
    commentCount: commentCountByTask.get(base.id) ?? 0,
  }));
}

// Ne renvoie que les tâches visibles par userId : celles qu'il a créées, ou
// pour lesquelles il figure dans task_assignees (quel que soit son rôle).
// Toute tâche privée à quelqu'un d'autre, ou partagée sans lui, est
// exclue — c'est ici que la confidentialité "privée par défaut" est
// appliquée, pas seulement dans l'affichage (voir src/lib/access.ts).
export async function getTasks(userId: string): Promise<Task[]> {
  const rows = (await sql`
    select * from tasks order by due_at asc nulls last
  `) as unknown as TaskBaseRow[];

  const tasks = await attachRelations(rows);
  return tasks.filter((t) => canView(t, userId));
}

// Renvoie la tâche si userId a le droit de la voir (créateur ou partagée
// avec lui), sinon null — la page appelante doit alors se comporter comme
// si la tâche n'existait pas (notFound()), pour ne rien révéler de son
// existence à quelqu'un qui n'y a pas accès.
export async function getTask(id: string, userId: string): Promise<Task | null> {
  const rows = (await sql`select * from tasks where id = ${id}`) as unknown as TaskBaseRow[];
  const base = rows[0];
  if (!base) return null;

  const [task] = await attachRelations([base]);
  return canView(task, userId) ? task : null;
}

// Commentaires triés du plus récent au plus ancien : le fil est affiché
// avec le formulaire d'ajout en tête (voir src/components/CommentThread.tsx),
// donc le dernier commentaire apparaît juste sous le champ de saisie.
export async function getComments(taskId: string): Promise<Comment[]> {
  const rows = await sql`
    select c.id as id, c.task_id as task_id, c.author_id as author_id, c.body as body, c.created_at as created_at,
           u.id as author_user_id, u.name as author_name, u.role as author_role, u.color as author_color,
           u.password_set as author_password_set, u.created_at as author_user_created_at
    from comments c
    left join users u on u.id = c.author_id
    where c.task_id = ${taskId}
    order by c.created_at desc
  `;

  return (
    rows as Array<{
      id: string;
      task_id: string;
      author_id: string;
      body: string;
      created_at: string;
      author_user_id: string | null;
      author_name: string;
      author_role: Profile["role"];
      author_color: string;
      author_password_set: boolean;
      author_user_created_at: string;
    }>
  ).map((row) => ({
    id: row.id,
    task_id: row.task_id,
    author_id: row.author_id,
    body: row.body,
    created_at: row.created_at,
    author: row.author_user_id
      ? {
          id: row.author_user_id,
          name: row.author_name,
          role: row.author_role,
          color: row.author_color,
          password_set: row.author_password_set,
          created_at: row.author_user_created_at,
        }
      : null,
  }));
}

// Statistiques par utilisateur pour l'écran admin (src/app/admin/page.tsx) :
// dernière activité, et 4 compteurs de tâches créées — total et sur les 7
// derniers jours, chacun ventilé privé/partagé (sur le champ dérivé
// tasks.visibility, voir src/lib/access.ts). On compte tout ce que
// created_by = cet utilisateur, sans filtrer par canView : l'admin doit
// voir l'activité réelle de chacun, pas seulement ce qui lui est partagé à
// lui — mais on ne sélectionne jamais le titre/la description d'une tâche,
// seulement created_by/created_at/visibility, pour ne jamais exposer le
// contenu d'une tâche privée sur cet écran, seulement des comptages.
// Calculé côté application plutôt qu'en SQL agrégé : la famille reste une
// poignée de comptes et quelques dizaines/centaines de tâches tout au
// plus, donc deux requêtes larges + un regroupement en mémoire restent
// largement suffisants et évitent une fonction SQL dédiée.
export async function getUserStats(): Promise<UserStats[]> {
  const [users, tasks] = await Promise.all([
    sql`select id, name, color, last_login_at from users order by name`,
    sql`select created_by, created_at, visibility from tasks`,
  ]);

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return (users as Array<{ id: string; name: string; color: string; last_login_at: string | null }>).map((u) => {
    const createdByUser = (tasks as Array<{ created_by: string; created_at: string; visibility: string }>).filter(
      (t) => t.created_by === u.id
    );
    const isPrivate = (t: { visibility: string }) => t.visibility === "private";
    const isRecent = (t: { created_at: string }) => new Date(t.created_at).getTime() >= oneWeekAgo;

    return {
      id: u.id,
      name: u.name,
      color: u.color,
      lastSeenAt: u.last_login_at,
      totalPrivate: createdByUser.filter(isPrivate).length,
      totalShared: createdByUser.filter((t) => !isPrivate(t)).length,
      weekPrivate: createdByUser.filter((t) => isPrivate(t) && isRecent(t)).length,
      weekShared: createdByUser.filter((t) => !isPrivate(t) && isRecent(t)).length,
    };
  });
}

// Fil "Activité du jour" de l'écran d'accueil (voir
// src/components/ActivityFeed.tsx et migration 005_activity_log.sql).
// `taskIds` doit déjà être limité aux tâches visibles par l'utilisateur
// courant (typiquement le résultat de getTasks(), déjà filtré par
// canView — voir src/lib/access.ts) : cette fonction ne refait pas cette
// vérification, elle se contente de restreindre la requête à ces id.
// `sinceIso` borne la fenêtre récupérée (ex. les dernières 48h) ; le
// regroupement "aujourd'hui uniquement" et par acteur/type/tâche se fait
// ensuite côté client dans ActivityFeed.tsx, sur le même principe que les
// compteurs du tableau de bord (voir la note sur le fuseau horaire dans
// src/lib/format.ts) — un Server Component tournant à l'heure UTC de
// Vercel ne peut pas fiabiliment déterminer "aujourd'hui" dans le fuseau
// réel de la famille.
export async function getRecentActivity(taskIds: string[], sinceIso: string): Promise<ActivityLogEntry[]> {
  if (taskIds.length === 0) return [];

  try {
    const rows = await sql`
      select al.id as id, al.task_id as task_id, al.task_title as task_title, al.actor_id as actor_id,
             al.type as type, al.detail as detail, al.created_at as created_at,
             u.id as actor_user_id, u.name as actor_name, u.color as actor_color
      from activity_log al
      left join users u on u.id = al.actor_id
      where al.task_id = any(${taskIds}) and al.created_at >= ${sinceIso}
      order by al.created_at desc
      limit 100
    `;

    return (
      rows as Array<{
        id: string;
        task_id: string;
        task_title: string;
        actor_id: string;
        type: ActivityLogEntry["type"];
        detail: string | null;
        created_at: string;
        actor_user_id: string | null;
        actor_name: string;
        actor_color: string;
      }>
    ).map((row) => ({
      id: row.id,
      task_id: row.task_id,
      task_title: row.task_title,
      actor_id: row.actor_id,
      type: row.type,
      detail: row.detail,
      created_at: row.created_at,
      actor: row.actor_user_id ? { id: row.actor_user_id, name: row.actor_name, color: row.actor_color } : null,
    }));
  } catch (e) {
    // La table peut ne pas encore exister si supabase/migrations/
    // 005_activity_log.sql n'a pas encore été appliquée en base — dégrade
    // en liste vide plutôt que de faire échouer tout l'écran d'accueil
    // (même principe de tolérance qu'à l'écriture, voir logActivity dans
    // src/lib/actions.ts).
    console.error("getRecentActivity:", e instanceof Error ? e.message : e);
    return [];
  }
}

// Activité de la semaine pour le défi familial (src/lib/challenges.ts) —
// même requête que getRecentActivity() mais SANS filtre `task_id` : un
// défi porte sur toute la famille, pas sur les tâches visibles par
// l'utilisateur qui regarde l'écran. Sûr par construction : logActivity()
// (src/lib/actions.ts) n'est jamais appelée pour une tâche privée, donc
// activity_log ne contient déjà que de l'activité partagée.
export async function getFamilyWeekActivity(sinceIso: string): Promise<ActivityLogEntry[]> {
  try {
    const rows = await sql`
      select al.id as id, al.task_id as task_id, al.task_title as task_title, al.actor_id as actor_id,
             al.type as type, al.detail as detail, al.created_at as created_at,
             u.id as actor_user_id, u.name as actor_name, u.color as actor_color
      from activity_log al
      left join users u on u.id = al.actor_id
      where al.created_at >= ${sinceIso}
      order by al.created_at desc
    `;

    return (
      rows as Array<{
        id: string;
        task_id: string;
        task_title: string;
        actor_id: string;
        type: ActivityLogEntry["type"];
        detail: string | null;
        created_at: string;
        actor_user_id: string | null;
        actor_name: string;
        actor_color: string;
      }>
    ).map((row) => ({
      id: row.id,
      task_id: row.task_id,
      task_title: row.task_title,
      actor_id: row.actor_id,
      type: row.type,
      detail: row.detail,
      created_at: row.created_at,
      actor: row.actor_user_id ? { id: row.actor_user_id, name: row.actor_name, color: row.actor_color } : null,
    }));
  } catch (e) {
    console.error("getFamilyWeekActivity:", e instanceof Error ? e.message : e);
    return [];
  }
}

// Snapshot des tâches partagées pour le défi familial (src/lib/
// challenges.ts) — utilisé pour les métriques du type "0 tâche partagée en
// retard", qui portent sur l'état actuel des tâches, pas sur le journal
// d'activité.
export async function getSharedTasksSnapshot(): Promise<Array<{ id: string; due_at: string | null; status: TaskStatus }>> {
  const rows = await sql`
    select id, due_at, status from tasks where visibility = 'shared'
  `;
  return rows as unknown as Array<{ id: string; due_at: string | null; status: TaskStatus }>;
}

// Jours actifs d'un utilisateur pour son streak personnel (src/lib/
// streaks.ts) — déduplique la table user_activity_log (alimentée par
// logUserActivity() dans src/lib/actions.ts, pour toute tâche privée ou
// partagée) en clés de jour civil Paris. Tolère l'absence de la table :
// la migration db/migrations/001_user_activity_log.sql doit être
// appliquée à la main sur Neon (voir docs/migration-neon.md) — tant que
// ce n'est pas fait, le streak reste à 0 plutôt que de faire échouer la
// page (même principe que getRecentActivity() ci-dessus).
export async function getUserActiveDays(userId: string, sinceIso: string): Promise<string[]> {
  try {
    const rows = await sql`
      select created_at from user_activity_log where user_id = ${userId} and created_at >= ${sinceIso}
    `;
    const days = new Set((rows as Array<{ created_at: string }>).map((r) => dateKeyFromIso(r.created_at)));
    return Array.from(days);
  } catch (e) {
    console.error("getUserActiveDays:", e instanceof Error ? e.message : e);
    return [];
  }
}

// Fil « À ton attention » de l'écran d'accueil (src/components/
// AttentionFeed.tsx) : les N dernières notifications **non lues** de
// l'utilisateur, plus récentes d'abord. Une notification marquée lue
// disparaît donc du fil (voir markNotificationReadAction /
// markNotificationsReadAction dans src/lib/actions.ts). Tolère l'absence
// de la table (migration 006 pas encore appliquée) en dégradant en liste
// vide, comme getRecentActivity().
export async function getMyNotifications(userId: string, limit = 30): Promise<NotificationItem[]> {
  try {
    const rows = await sql`
      select id, type, task_id, title, body, read_at, created_at
      from notifications
      where user_id = ${userId} and read_at is null
      order by created_at desc
      limit ${limit}
    `;
    return rows as unknown as NotificationItem[];
  } catch (e) {
    console.error("getMyNotifications:", e instanceof Error ? e.message : e);
    return [];
  }
}

// Nombre à afficher sur la pastille de l'icône de l'appli (App Badge, voir
// public/sw.js et HomeDashboard.tsx) : notifications "À ton attention" non
// lues + tâches en retard visibles par l'utilisateur (même définition que
// isOverdue(), utilisée partout ailleurs dans l'appli — badge "En retard"
// de la carte de tâche, compteur de l'accueil, etc.). Réutilise getTasks()
// (déjà filtré par canView, voir src/lib/access.ts) plutôt que de dupliquer
// la logique de visibilité dans une requête dédiée : le volume de tâches
// d'une famille reste faible, la clarté prime sur la micro-optimisation.
export async function getBadgeCount(userId: string): Promise<number> {
  const [unread, tasks] = await Promise.all([
    sql`select count(*)::int as n from notifications where user_id = ${userId} and read_at is null`
      .then((rows) => (rows[0] as { n: number } | undefined)?.n ?? 0)
      .catch(() => 0),
    getTasks(userId),
  ]);
  // Comme les compteurs de l'écran d'accueil (HomeDashboard.tsx) : ne compte
  // que les tâches en retard dont l'utilisateur est responsable (créateur ou
  // assigné avec droit de modification), pas celles en lecture seule —
  // même définition, canEdit() (src/lib/access.ts), pour que la pastille et
  // la tuile "En retard" affichent toujours le même chiffre.
  const overdue = tasks.filter((t) => canEdit(t, userId) && isOverdue(t.due_at, t.status)).length;
  return unread + overdue;
}

// Liste des membres pour l'onglet « Membres » de l'écran admin
// (src/components/UserManager.tsx). Comme getUserStats, on compte côté
// application plutôt qu'en SQL agrégé (poignée de comptes, quelques
// dizaines de tâches). `createdTasks` / `sharedTasks` / `authoredComments`
// servent à afficher, avant suppression d'un membre, ce qui sera supprimé
// avec lui (les tâches qu'il a créées et ses commentaires — voir
// deleteMemberAction dans src/lib/admin-actions.ts).
export async function getMembers(): Promise<Member[]> {
  // Fenêtre alignée sur la borne de sécurité de computeStreak() (voir
  // src/lib/streaks.ts) : au-delà, le streak serait de toute façon plafonné.
  const activeDaysSinceIso = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
  const todayKey = dateKeyFromDate(new Date());

  const [users, tasks, comments, activityDaysByUser] = await Promise.all([
    sql`select id, name, role, color, password_set, created_at, last_login_at from users order by name`,
    sql`select created_by, visibility from tasks`,
    sql`select author_id from comments`,
    getAllUserActiveDays(activeDaysSinceIso),
  ]);

  return (
    users as Array<{
      id: string;
      name: string;
      role: Member["role"];
      color: string;
      password_set: boolean;
      created_at: string;
      last_login_at: string | null;
    }>
  ).map((u) => {
    const own = (tasks as Array<{ created_by: string; visibility: string }>).filter((t) => t.created_by === u.id);
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      color: u.color,
      password_set: u.password_set,
      created_at: u.created_at,
      lastSeenAt: u.last_login_at,
      createdTasks: own.length,
      sharedTasks: own.filter((t) => t.visibility === "shared").length,
      authoredComments: (comments as Array<{ author_id: string }>).filter((c) => c.author_id === u.id).length,
      streak: computeStreak(activityDaysByUser.get(u.id) ?? [], todayKey),
    };
  });
}

// Jours actifs de TOUS les utilisateurs, groupés par user_id (streaks
// affichés dans l'onglet « Membres » de l'écran admin — voir
// getMembers() ci-dessus). Même table et même dégradation gracieuse que
// getUserActiveDays(), mais en une seule requête plutôt qu'une par
// membre.
async function getAllUserActiveDays(sinceIso: string): Promise<Map<string, string[]>> {
  try {
    const rows = await sql`
      select user_id, created_at from user_activity_log where created_at >= ${sinceIso}
    `;
    const days = new Map<string, Set<string>>();
    for (const r of rows as Array<{ user_id: string; created_at: string }>) {
      const day = dateKeyFromIso(r.created_at);
      if (!days.has(r.user_id)) days.set(r.user_id, new Set());
      days.get(r.user_id)!.add(day);
    }
    return new Map(Array.from(days.entries()).map(([userId, set]) => [userId, Array.from(set)]));
  } catch (e) {
    console.error("getAllUserActiveDays:", e instanceof Error ? e.message : e);
    return new Map();
  }
}

// Utilisé par l'écran de connexion et par setPasswordAction : recherche un
// utilisateur par id, en incluant cette fois password_hash. Réservé au
// code serveur d'authentification (src/lib/actions.ts) — ne jamais renvoyer
// le résultat de cette fonction tel quel à un composant.
export async function getUserWithPasswordHash(
  id: string
): Promise<(Profile & { password_hash: string }) | null> {
  const rows = await sql`
    select id, name, role, color, password_set, created_at, password_hash
    from users
    where id = ${id}
  `;
  return (rows[0] as unknown as (Profile & { password_hash: string })) ?? null;
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getUserWithPasswordHash, upsertTagIds } from "@/lib/queries";
import { computeVisibility } from "@/lib/access";
import {
  clearSessionCookie,
  getSessionUserId,
  hashPassword,
  recordLogin,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { computeNextOccurrence, formatDate, STATUS_LABELS } from "@/lib/format";
import { parisWallTimeToUtcIso } from "@/lib/timezone";
import { safeNextPath } from "@/lib/nav";
import { actorName, notifyTaskParticipants, notifyUser } from "@/lib/notifications";
import { FALLBACK_CATEGORY_SLUG } from "@/lib/categories";
import type { ActivityType, Recurrence, ShareRole, TaskStatus, Visibility } from "@/lib/types";

// Vérifie les droits d'un utilisateur sur une tâche par son id, sans avoir
// à recharger toute la tâche avec ses jointures — utilisé par les Server
// Actions ci-dessous (modifier/supprimer/changer le statut/commenter) qui
// n'ont pas déjà la tâche en mémoire. Renvoie exists:false si la tâche
// n'existe plus.
//
// Renvoie aussi `title`/`visibility` : pratique pour ne pas avoir à
// recharger la tâche juste pour journaliser une activité (voir
// logActivity ci-dessous). `visibility` sert notamment à ne journaliser
// une action que si la tâche est effectivement partagée (au moins une
// autre personne que le créateur y a accès), pas sur une tâche privée où
// personne d'autre ne pourrait de toute façon voir l'activité.
//
// Vit dans ce fichier ("use server", jamais bundlé côté client) plutôt
// que dans src/lib/access.ts : ce dernier n'expose que des fonctions
// pures (canView, canEdit, computeVisibility), importées aussi bien par
// des Server Components que par des composants client — un import de
// `sql` (src/lib/db.ts) au niveau du module y casserait le bundle
// navigateur, `DATABASE_URL` n'étant jamais exposée au client.
async function getTaskAccess(
  taskId: string,
  userId: string
): Promise<{
  exists: boolean;
  createdBy?: string;
  title?: string;
  visibility?: Visibility;
  dueAt?: string | null;
  canView: boolean;
  canEdit: boolean;
}> {
  const taskRows = await sql`
    select id, created_by, title, visibility, due_at from tasks where id = ${taskId}
  `;
  const task = taskRows[0] as { id: string; created_by: string; title: string; visibility: Visibility; due_at: string | null } | undefined;
  if (!task) return { exists: false, canView: false, canEdit: false };

  if (task.created_by === userId) {
    return {
      exists: true,
      createdBy: task.created_by,
      title: task.title,
      visibility: task.visibility,
      dueAt: task.due_at,
      canView: true,
      canEdit: true,
    };
  }

  const shareRows = await sql`
    select role from task_assignees where task_id = ${taskId} and user_id = ${userId}
  `;
  const share = shareRows[0] as { role: "editor" | "viewer" } | undefined;

  if (!share) {
    return {
      exists: true,
      createdBy: task.created_by,
      title: task.title,
      visibility: task.visibility,
      dueAt: task.due_at,
      canView: false,
      canEdit: false,
    };
  }
  return {
    exists: true,
    createdBy: task.created_by,
    title: task.title,
    visibility: task.visibility,
    dueAt: task.due_at,
    canView: true,
    canEdit: share.role === "editor",
  };
}

async function syncTaskTags(taskId: string, tagNames: string[]) {
  const tagIds = await upsertTagIds(tagNames);
  await sql`delete from task_tags where task_id = ${taskId}`;
  if (tagIds.length) {
    await sql`insert into task_tags (task_id, tag_id) select ${taskId}, unnest(${tagIds}::uuid[])`;
  }
}

// Lit le partage soumis par TaskForm.tsx : un champ radio "role-<userId>"
// par membre de la famille (hors créateur, qui n'est pas dans le
// formulaire), valant "editor" ou "viewer". Le créateur est toujours
// forcé "editor", quoi que le formulaire contienne — c'est ce qui
// garantit qu'il ne perd jamais l'accès à ses propres tâches.
function parseShareRoles(formData: FormData, creatorId: string): Map<string, ShareRole> {
  const roles = new Map<string, ShareRole>();
  for (const [key, value] of formData.entries()) {
    const match = /^role-(.+)$/.exec(key);
    if (match && (value === "editor" || value === "viewer")) {
      roles.set(match[1], value);
    }
  }
  roles.set(creatorId, "editor");
  return roles;
}

// Insère les lignes task_assignees d'une tâche en un aller-retour : le
// couple (id, role) parallèle est reconstitué côté Postgres via
// unnest(tableau1, tableau2), qui produit une ligne par paire — plus
// simple qu'un insert multi-lignes construit à la main.
async function insertAssignees(taskId: string, shareRoles: Map<string, ShareRole>) {
  const ids = Array.from(shareRoles.keys());
  const roles = Array.from(shareRoles.values());
  await sql`
    insert into task_assignees (task_id, user_id, role)
    select ${taskId}, u, r from unnest(${ids}::uuid[], ${roles}::text[]) as t(u, r)
  `;
}

// --- Journal d'activité --------------------------------------------------
//
// Alimente le fil "Activité du jour" de l'écran d'accueil
// (src/components/ActivityFeed.tsx) : trace une action faite sur une tâche
// pour informer les autres personnes qui y ont accès de ce qui s'y passe.
// N'est appelé qu'avec une tâche `shared` (au moins une autre personne que
// le créateur y a accès) — sur une tâche privée, personne d'autre ne
// pourrait de toute façon voir cette activité, inutile de l'écrire.
//
// Écriture volontairement non bloquante : si la table `activity_log`
// n'existe pas encore ou pour toute autre erreur d'écriture, on logue côté
// serveur et on continue plutôt que de faire échouer l'action principale
// (créer une tâche, commenter, etc.), qui elle doit toujours réussir.
async function logActivity(params: {
  taskId: string;
  actorId: string;
  type: ActivityType;
  taskTitle: string;
  detail?: string | null;
}) {
  try {
    await sql`
      insert into activity_log (task_id, actor_id, type, task_title, detail)
      values (${params.taskId}, ${params.actorId}, ${params.type}, ${params.taskTitle}, ${params.detail ?? null})
    `;
  } catch (e) {
    console.error("logActivity:", e instanceof Error ? e.message : e);
  }
}

// Valide le slug de catégorie soumis contre la table `categories`
// (migration 009) — repli sur « autre » si absent (formulaire d'une autre
// session, valeur trafiquée…). La FK ON DELETE RESTRICT ferait de toute
// façon échouer un slug inconnu, mais on préfère un repli silencieux.
async function resolveCategorySlug(raw: string): Promise<string> {
  const slug = raw.trim();
  if (!slug) return FALLBACK_CATEGORY_SLUG;
  try {
    const rows = await sql`select slug from categories where slug = ${slug}`;
    return rows[0] ? slug : FALLBACK_CATEGORY_SLUG;
  } catch {
    // Table absente (migration 009 pas encore jouée) : on fait confiance à
    // la valeur soumise, déjà validée côté client contre DEFAULT_CATEGORIES.
    return slug;
  }
}

function parseRecurrence(formData: FormData): Recurrence {
  const type = String(formData.get("recurrenceType") || "none") as Recurrence["type"];
  if (type === "custom") {
    return {
      type: "custom",
      interval: Number(formData.get("recurrenceInterval")) || 1,
      unit: (String(formData.get("recurrenceUnit") || "weeks") as Recurrence["unit"]) ?? "weeks",
    };
  }
  return { type, interval: 1 };
}

// --- Authentification -------------------------------------------------

// Connexion "normale" : l'utilisateur a déjà défini son propre mot de
// passe (password_set = true).
export async function loginAction(
  userId: string,
  password: string,
  next?: string
): Promise<{ error?: string }> {
  const user = await getUserWithPasswordHash(userId);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: "Mot de passe incorrect." };
  }

  await setSessionCookie(user.id);
  await recordLogin(user.id);
  redirect(safeNextPath(next));
}

// Première connexion (mot de passe temporaire) ou changement volontaire de
// mot de passe : vérifie le mot de passe actuel/temporaire, puis enregistre
// le nouveau et ouvre une session.
export async function setPasswordAction(
  userId: string,
  currentPassword: string,
  newPassword: string,
  next?: string
): Promise<{ error?: string }> {
  if (newPassword.length < 6) {
    return { error: "Le mot de passe doit contenir au moins 6 caractères." };
  }

  const user = await getUserWithPasswordHash(userId);

  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return {
      error: user?.password_set
        ? "Mot de passe actuel incorrect."
        : "Mot de passe temporaire incorrect.",
    };
  }

  try {
    await sql`update users set password_hash = ${hashPassword(newPassword)}, password_set = true where id = ${userId}`;
  } catch {
    return { error: "Impossible d'enregistrer le nouveau mot de passe. Réessaie." };
  }

  await setSessionCookie(userId);
  await recordLogin(userId);
  redirect(safeNextPath(next));
}

// Changement de mot de passe par un utilisateur déjà connecté (écran
// "Mon compte", src/app/compte/page.tsx). Contrairement à setPasswordAction
// — appelé depuis l'écran de connexion — l'identité vient de la session et
// non d'un paramètre, et on ne rouvre pas de session ni ne redirige : le
// cookie JWT reste valable (il ne dépend pas du hash du mot de passe).
export async function changePasswordAction(
  currentPassword: string,
  newPassword: string
): Promise<{ error?: string; ok?: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  if (newPassword.length < 6) {
    return { error: "Le mot de passe doit contenir au moins 6 caractères." };
  }

  const user = await getUserWithPasswordHash(userId);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return { error: "Mot de passe actuel incorrect." };
  }

  try {
    await sql`update users set password_hash = ${hashPassword(newPassword)}, password_set = true where id = ${userId}`;
  } catch {
    return { error: "Impossible d'enregistrer le nouveau mot de passe. Réessaie." };
  }

  return { ok: true };
}

export async function signOutAction() {
  clearSessionCookie();
  redirect("/login");
}

// --- Tâches -------------------------------------------------------------

export async function createTaskAction(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const description = String(formData.get("description") || "");
  const dueAtRaw = String(formData.get("dueAt") || "");
  const dueAt = dueAtRaw ? parisWallTimeToUtcIso(dueAtRaw) : null;
  const recurrence = parseRecurrence(formData);
  const categoryRaw = String(formData.get("category") || "");
  const category = await resolveCategorySlug(categoryRaw);
  const tagNames = formData.getAll("tags").map(String);

  const shareRoles = parseShareRoles(formData, userId);
  const visibility = computeVisibility(userId, Array.from(shareRoles.keys()));

  let task: { id: string } | undefined;
  try {
    const rows = await sql`
      insert into tasks (title, description, due_at, visibility, recurrence, category, created_by)
      values (${title}, ${description}, ${dueAt}, ${visibility}, ${JSON.stringify(recurrence)}, ${category}, ${userId})
      returning *
    `;
    task = rows[0] as { id: string } | undefined;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Impossible de créer la tâche.");
  }
  if (!task) throw new Error("Impossible de créer la tâche.");

  await insertAssignees(task.id, shareRoles);
  await syncTaskTags(task.id, tagNames);

  if (visibility === "shared") {
    await logActivity({ taskId: task.id, actorId: userId, type: "task_created", taskTitle: title });
    // Notifier chaque personne avec qui la tâche est partagée (hors créateur).
    const who = await actorName(userId);
    await Promise.all(
      Array.from(shareRoles.keys())
        .filter((id) => id !== userId)
        .map((id) =>
          notifyUser({
            userId: id,
            type: "task_shared",
            taskId: task!.id,
            title: `${who} t'a partagé « ${title} »`,
          })
        )
    );
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  redirect(`/tasks/${task.id}`);
}

export async function updateTaskAction(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const taskId = String(formData.get("taskId"));
  if (!taskId) return;

  const access = await getTaskAccess(taskId, userId);
  if (!access.exists) return;
  if (!access.canEdit) {
    throw new Error("Tu n'as pas le droit de modifier cette tâche.");
  }
  const creatorId = access.createdBy!;

  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const description = String(formData.get("description") || "");
  const dueAtRaw = String(formData.get("dueAt") || "");
  const dueAt = dueAtRaw ? parisWallTimeToUtcIso(dueAtRaw) : null;
  const status = String(formData.get("status") || "todo");
  const recurrence = parseRecurrence(formData);
  const categoryRaw = String(formData.get("category") || "");
  const category = await resolveCategorySlug(categoryRaw);
  const tagNames = formData.getAll("tags").map(String);

  // Le créateur original garde toujours l'accès complet, même si la
  // personne qui modifie la tâche est un autre éditeur que lui.
  const shareRoles = parseShareRoles(formData, creatorId);
  const visibility = computeVisibility(creatorId, Array.from(shareRoles.keys()));

  try {
    await sql`
      update tasks
      set title = ${title}, description = ${description}, due_at = ${dueAt},
          visibility = ${visibility}, status = ${status}, recurrence = ${JSON.stringify(recurrence)}, category = ${category}
      where id = ${taskId}
    `;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Impossible de mettre à jour la tâche.");
  }

  // Partage effectif avant modification, pour ne notifier que les personnes
  // réellement ajoutées par cette modification (pas celles déjà présentes).
  const prevAssigneeRows = await sql`select user_id from task_assignees where task_id = ${taskId}`;
  const previouslyShared = new Set((prevAssigneeRows as { user_id: string }[]).map((a) => a.user_id));

  await sql`delete from task_assignees where task_id = ${taskId}`;
  try {
    await insertAssignees(taskId, shareRoles);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Impossible d'enregistrer le partage.");
  }

  await syncTaskTags(taskId, tagNames);

  if (visibility === "shared") {
    await logActivity({ taskId, actorId: userId, type: "task_updated", taskTitle: title });

    // Défi familial "Sans dernière minute" (src/lib/challenges.ts) : trace
    // chaque changement d'échéance sur une tâche partagée, en plus du
    // task_updated générique ci-dessus.
    if ((access.dueAt ?? null) !== dueAt) {
      await logActivity({
        taskId,
        actorId: userId,
        type: "due_date_changed",
        taskTitle: title,
        detail: `${formatDate(access.dueAt ?? null)} → ${formatDate(dueAt)}`,
      });
    }

    // Seules les personnes **nouvellement** ajoutées par cette modification
    // reçoivent une notification (« t'a partagé »). La modification d'une
    // tâche à laquelle on a déjà accès n'est plus notifiée (ni push, ni
    // pastille) : c'est de l'ambiance, elle apparaît dans « Activité du
    // jour » via logActivity ci-dessus (audit UX INC-7, 10/09/2026).
    const currentIds = Array.from(shareRoles.keys());
    const newlyShared = currentIds.filter(
      (id) => id !== userId && id !== creatorId && !previouslyShared.has(id)
    );
    if (newlyShared.length > 0) {
      const who = await actorName(userId);
      await Promise.all(
        newlyShared.map((id) =>
          notifyUser({
            userId: id,
            type: "task_shared",
            taskId,
            title: `${who} t'a partagé « ${title} »`,
          })
        )
      );
    }
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function deleteTaskAction(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const taskId = String(formData.get("taskId"));
  if (!taskId) return;

  const access = await getTaskAccess(taskId, userId);
  if (!access.exists) return;
  if (!access.canEdit) {
    throw new Error("Tu n'as pas le droit de supprimer cette tâche.");
  }

  // Titre + destinataires récupérés AVANT la suppression : task_assignees
  // et les notifications rattachées à la tâche disparaissent en cascade
  // (on delete cascade), donc la notification de suppression est créée
  // avec taskId = null (rien vers quoi renvoyer) et le titre figé dans le
  // texte.
  const taskTitle = access.title ?? "une tâche";
  let recipients: string[] = [];
  if (access.visibility === "shared") {
    const assigneeRows = await sql`select user_id from task_assignees where task_id = ${taskId}`;
    recipients = Array.from(
      new Set([access.createdBy!, ...(assigneeRows as { user_id: string }[]).map((a) => a.user_id)])
    ).filter((id) => id !== userId);
  }

  await sql`delete from tasks where id = ${taskId}`;

  if (recipients.length > 0) {
    const who = await actorName(userId);
    await Promise.all(
      recipients.map((id) =>
        notifyUser({
          userId: id,
          type: "task_deleted",
          taskId: null,
          title: `${who} a supprimé « ${taskTitle} »`,
        })
      )
    );
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  redirect("/tasks");
}

// Change le statut d'une tâche. Si elle est récurrente et clôturée
// ("done"), régénère automatiquement la prochaine occurrence avec les
// mêmes assignations.
export async function setStatusAction(taskId: string, status: string) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const access = await getTaskAccess(taskId, userId);
  if (!access.exists) return;
  if (!access.canEdit) {
    throw new Error("Tu n'as pas le droit de modifier le statut de cette tâche.");
  }

  const taskRows = await sql`select * from tasks where id = ${taskId}`;
  const task = taskRows[0] as
    | {
        id: string;
        title: string;
        description: string;
        due_at: string | null;
        recurrence: Recurrence;
        visibility: "shared" | "private";
        category: string;
        created_by: string;
      }
    | undefined;
  if (!task) return;

  try {
    await sql`update tasks set status = ${status} where id = ${taskId}`;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Impossible de mettre à jour le statut.");
  }

  if (task.visibility === "shared") {
    // Un changement de statut n'est plus notifié (ni push, ni pastille) :
    // qu'un proche fasse avancer une tâche partagée est de l'ambiance, pas
    // une sollicitation — ça reste visible dans « Activité du jour » via
    // logActivity (audit UX INC-7, 10/09/2026).
    const statusLabel = STATUS_LABELS[status as TaskStatus] ?? status;
    await logActivity({
      taskId,
      actorId: userId,
      type: "status_changed",
      taskTitle: task.title,
      detail: statusLabel,
    });
  }

  if (status === "done" && task.recurrence && task.recurrence.type !== "none") {
    const next = computeNextOccurrence(task.due_at, task.recurrence);
    if (next) {
      const newRows = await sql`
        insert into tasks (title, description, due_at, recurrence, visibility, category, created_by, status)
        values (${task.title}, ${task.description}, ${next}, ${JSON.stringify(task.recurrence)}, ${task.visibility}, ${task.category}, ${task.created_by}, 'todo')
        returning *
      `;
      const newTask = newRows[0] as { id: string } | undefined;

      if (newTask) {
        const [assignees, taskTags, checklistItems] = await Promise.all([
          sql`select user_id, role from task_assignees where task_id = ${taskId}`,
          sql`select tag_id from task_tags where task_id = ${taskId}`,
          sql`select label from checklist_items where task_id = ${taskId}`,
        ]);
        const assigneeRows = assignees as { user_id: string; role: string }[];
        if (assigneeRows.length) {
          const ids = assigneeRows.map((a) => a.user_id);
          const roles = assigneeRows.map((a) => a.role);
          await sql`
            insert into task_assignees (task_id, user_id, role)
            select ${newTask.id}, u, r from unnest(${ids}::uuid[], ${roles}::text[]) as t(u, r)
          `;
        }
        const tagRows = taskTags as { tag_id: string }[];
        if (tagRows.length) {
          const tagIds = tagRows.map((t) => t.tag_id);
          await sql`insert into task_tags (task_id, tag_id) select ${newTask.id}, unnest(${tagIds}::uuid[])`;
        }
        // La checklist repart décochée sur la nouvelle occurrence — recopier
        // l'état "coché" de la tâche qui vient de se terminer n'aurait pas
        // de sens pour une tâche récurrente (ex. liste de courses).
        const checklistRows = checklistItems as { label: string }[];
        if (checklistRows.length) {
          const labels = checklistRows.map((c) => c.label);
          await sql`
            insert into checklist_items (task_id, label, done)
            select ${newTask.id}, u, false from unnest(${labels}::text[]) as u
          `;
        }
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function addCommentAction(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const taskId = String(formData.get("taskId"));
  const body = String(formData.get("body") || "").trim();
  if (!taskId || !body) return;

  // Un lecteur ("viewer") peut commenter, pas seulement un éditeur — voir
  // src/lib/access.ts.
  const access = await getTaskAccess(taskId, userId);
  if (!access.exists || !access.canView) return;

  try {
    await sql`insert into comments (task_id, author_id, body) values (${taskId}, ${userId}, ${body})`;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Impossible d'ajouter le commentaire.");
  }

  if (access.visibility === "shared") {
    await logActivity({ taskId, actorId: userId, type: "comment_added", taskTitle: access.title ?? "" });
    const who = await actorName(userId);
    await notifyTaskParticipants({
      taskId,
      excludeUserId: userId,
      type: "comment_added",
      title: `${who} a commenté « ${access.title ?? "une tâche"} »`,
      body: body.length > 140 ? `${body.slice(0, 137)}…` : body,
    });
  }

  revalidatePath("/");
  revalidatePath(`/tasks/${taskId}`);
}

// Un commentaire peut être supprimé par son propre auteur, ou par le
// créateur de la tâche (qui reste responsable de sa tâche et peut modérer
// les commentaires qui y sont laissés) — pas par un simple éditeur/lecteur
// assigné, qui n'a pas ce rôle de modération. Contrairement à
// addCommentAction (ouvert à canView), la suppression n'est donc pas basée
// sur getTaskAccess().canEdit — un éditeur assigné ne peut pas supprimer le
// commentaire de quelqu'un d'autre.
export async function deleteCommentAction(taskId: string, commentId: string) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const commentRows = await sql`select id, task_id, author_id from comments where id = ${commentId}`;
  const comment = commentRows[0] as { id: string; task_id: string; author_id: string } | undefined;
  if (!comment || comment.task_id !== taskId) return;

  const access = await getTaskAccess(taskId, userId);
  if (!access.exists) return;
  const canDelete = comment.author_id === userId || access.createdBy === userId;
  if (!canDelete) return;

  await sql`delete from comments where id = ${commentId}`;

  if (access.visibility === "shared") {
    await logActivity({ taskId, actorId: userId, type: "comment_deleted", taskTitle: access.title ?? "" });
  }

  revalidatePath(`/tasks/${taskId}`);
}

// --- Checklist ------------------------------------------------------
//
// Gérée directement depuis l'écran de détail (pas depuis le formulaire de
// création/modification) — voir src/components/ChecklistSection.tsx.
// Ajouter/cocher/supprimer un item exige canEdit, comme changer le statut
// de la tâche (contrairement aux commentaires, ouverts aux lecteurs) : une
// checklist fait partie du contenu de la tâche, pas d'une discussion
// autour.

export async function addChecklistItemAction(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const taskId = String(formData.get("taskId"));
  const label = String(formData.get("label") || "").trim();
  if (!taskId || !label) return;

  const access = await getTaskAccess(taskId, userId);
  if (!access.exists || !access.canEdit) return;

  try {
    await sql`insert into checklist_items (task_id, label) values (${taskId}, ${label})`;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Impossible d'ajouter l'item.");
  }

  if (access.visibility === "shared") {
    await logActivity({
      taskId,
      actorId: userId,
      type: "checklist_item_added",
      taskTitle: access.title ?? "",
      detail: label,
    });
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function toggleChecklistItemAction(taskId: string, itemId: string, done: boolean) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const access = await getTaskAccess(taskId, userId);
  if (!access.exists || !access.canEdit) return;

  // Le filtre task_id = ... est une ceinture-bretelles : garantit qu'un
  // itemId ne peut agir que sur la tâche pour laquelle l'accès vient
  // d'être vérifié, même si itemId provenait d'ailleurs. `returning label`
  // récupère le libellé de l'item pour le journal d'activité, sans requête
  // supplémentaire.
  let updated: { label: string } | undefined;
  try {
    const rows = await sql`
      update checklist_items set done = ${done} where id = ${itemId} and task_id = ${taskId}
      returning label
    `;
    updated = rows[0] as { label: string } | undefined;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Impossible de mettre à jour l'item.");
  }

  if (access.visibility === "shared") {
    await logActivity({
      taskId,
      actorId: userId,
      type: done ? "checklist_item_checked" : "checklist_item_unchecked",
      taskTitle: access.title ?? "",
      detail: updated?.label ?? null,
    });
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function deleteChecklistItemAction(taskId: string, itemId: string) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const access = await getTaskAccess(taskId, userId);
  if (!access.exists || !access.canEdit) return;

  // Le libellé est récupéré avant suppression : il n'existera plus pour le
  // journal d'activité une fois la ligne supprimée.
  const itemRows = await sql`select label from checklist_items where id = ${itemId} and task_id = ${taskId}`;
  const item = itemRows[0] as { label: string } | undefined;

  await sql`delete from checklist_items where id = ${itemId} and task_id = ${taskId}`;

  if (access.visibility === "shared") {
    await logActivity({
      taskId,
      actorId: userId,
      type: "checklist_item_removed",
      taskTitle: access.title ?? "",
      detail: item?.label ?? null,
    });
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

// --- Notifications --------------------------------------------------------

// Marque UNE notification comme lue — bouton dédié sur chaque ligne du fil
// « À ton attention », et aussi appelé au clic sur la notification pour
// aller à la tâche concernée (src/components/AttentionFeed.tsx). Une fois
// lue, elle ne réapparaît plus dans le fil (getMyNotifications ne renvoie
// que les non lues). Filtrée par `user_id` : on ne peut marquer que ses
// propres notifications, même en connaissant l'id d'une autre.
export async function markNotificationReadAction(notificationId: string) {
  const userId = await getSessionUserId();
  if (!userId || !notificationId) return;

  try {
    await sql`
      update notifications set read_at = now()
      where id = ${notificationId} and user_id = ${userId} and read_at is null
    `;
  } catch (e) {
    console.error("markNotificationReadAction:", e instanceof Error ? e.message : e);
  }

  revalidatePath("/");
}

// Marque toutes les notifications non lues de l'utilisateur courant comme
// lues (bouton « Tout marquer comme lu » du fil « À ton attention » —
// src/components/AttentionFeed.tsx).
export async function markNotificationsReadAction() {
  const userId = await getSessionUserId();
  if (!userId) return;

  try {
    await sql`update notifications set read_at = now() where user_id = ${userId} and read_at is null`;
  } catch (e) {
    console.error("markNotificationsReadAction:", e instanceof Error ? e.message : e);
  }

  revalidatePath("/");
}

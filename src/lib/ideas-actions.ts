"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import type { IdeaStatus } from "@/lib/types";

// Gestion de la boîte à idées (onglet Idées, migration 010) — ouverte à
// tout utilisateur connecté, pas réservée à l'admin : au même titre que
// les tâches, toute la famille peut proposer une idée et faire avancer son
// statut. Même moule que src/lib/garden-actions.ts (Result { error?, ok? },
// FormData en entrée pour la création).

type Result = { error?: string; ok?: boolean };

const IDEA_STATUSES: IdeaStatus[] = ["created", "processed", "done"];

function tableMissing(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "42P01";
}
const MIGRATION_MISSING = "Applique d'abord la migration 010_ideas.sql sur Neon.";

function revalidate() {
  revalidatePath("/idees");
}

export async function createIdeaAction(formData: FormData): Promise<Result> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const content = String(formData.get("content") || "").trim();
  if (!content) return { error: "Décris ton idée." };
  if (content.length > 2000) return { error: "Cette idée est trop longue." };

  try {
    await sql`insert into ideas (content, created_by) values (${content}, ${userId})`;
  } catch (e) {
    if (tableMissing(e)) return { error: MIGRATION_MISSING };
    return { error: e instanceof Error ? e.message : "Impossible d'ajouter cette idée." };
  }

  revalidate();
  return { ok: true };
}

export async function setIdeaStatusAction(ideaId: string, status: IdeaStatus): Promise<Result> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  if (!ideaId) return { error: "Idée introuvable." };
  if (!IDEA_STATUSES.includes(status)) return { error: "Statut invalide." };

  try {
    await sql`update ideas set status = ${status} where id = ${ideaId}`;
  } catch (e) {
    if (tableMissing(e)) return { error: MIGRATION_MISSING };
    return { error: "Impossible de mettre à jour cette idée." };
  }

  revalidate();
  return { ok: true };
}

export async function deleteIdeaAction(ideaId: string): Promise<Result> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  if (!ideaId) return { error: "Idée introuvable." };

  try {
    await sql`delete from ideas where id = ${ideaId}`;
  } catch (e) {
    if (tableMissing(e)) return { error: MIGRATION_MISSING };
    return { error: "Impossible de supprimer cette idée." };
  }

  revalidate();
  return { ok: true };
}

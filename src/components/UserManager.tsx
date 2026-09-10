"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Member } from "@/lib/types";
import {
  createMemberAction,
  deleteMemberAction,
  resetMemberPasswordAction,
  updateMemberAction,
} from "@/lib/admin-actions";
import { generateTempPassword } from "@/lib/temp-password";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Avatar } from "./Avatar";
import { Time } from "./Time";
import { IconCheck, IconPlus, IconX } from "./Icons";

// Onglet « Membres » de l'écran admin (voir AdminScreen.tsx et 6.9) :
// créer un membre avec un mot de passe temporaire, réinitialiser le mot
// de passe d'un membre, supprimer un membre. Toutes les opérations sont
// vérifiées côté serveur (rôle admin) dans src/lib/admin-actions.ts.
export function UserManager({
  currentUserId,
  members,
}: {
  currentUserId: string;
  members: Member[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [createPassword, setCreatePassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<"user" | "admin">("user");
  const [editError, setEditError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Member | null>(null);

  // Panneau persistant après création / réinitialisation : le mot de passe
  // temporaire à transmettre. Reste affiché jusqu'à ce qu'on le referme.
  const [lastResult, setLastResult] = useState<
    { kind: "created" | "reset"; name: string; password: string } | null
  >(null);

  function openCreate() {
    setName("");
    setRole("user");
    setCreatePassword(generateTempPassword());
    setCreateError(null);
    setShowCreate(true);
  }

  function openReset(id: string) {
    setResetPassword(generateTempPassword());
    setResetError(null);
    setResettingId(id);
    setEditingId(null);
  }

  function openEdit(m: Member) {
    setEditName(m.name);
    setEditRole(m.role);
    setEditError(null);
    setEditingId(m.id);
    setResettingId(null);
  }

  function handleEdit(e: FormEvent, member: Member) {
    e.preventDefault();
    setEditError(null);
    const isSelf = member.id === currentUserId;
    startTransition(async () => {
      const res = await updateMemberAction(member.id, {
        name: editName,
        role: isSelf ? undefined : editRole,
      });
      if (res.error) {
        setEditError(res.error);
        return;
      }
      setEditingId(null);
      toast.show({ message: "Membre mis à jour", tone: "success" });
      router.refresh();
    });
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("role", role);
    fd.set("tempPassword", createPassword);
    startTransition(async () => {
      const res = await createMemberAction(fd);
      if (res.error) {
        setCreateError(res.error);
        return;
      }
      setShowCreate(false);
      setLastResult({ kind: "created", name: res.name!, password: res.tempPassword! });
      toast.show({ message: `${res.name} a été créé`, tone: "success" });
      router.refresh();
    });
  }

  function handleReset(e: FormEvent, member: Member) {
    e.preventDefault();
    setResetError(null);
    startTransition(async () => {
      const res = await resetMemberPasswordAction(member.id, resetPassword);
      if (res.error) {
        setResetError(res.error);
        return;
      }
      setResettingId(null);
      setLastResult({ kind: "reset", name: res.name!, password: res.tempPassword! });
      toast.show({ message: `Mot de passe de ${res.name} réinitialisé`, tone: "success" });
      router.refresh();
    });
  }

  function handleDelete(member: Member) {
    startTransition(async () => {
      const res = await deleteMemberAction(member.id);
      setDeleting(null);
      if (res.error) {
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      toast.show({ message: `${member.name} a été supprimé`, tone: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-ink-muted">
          {members.length} membre{members.length > 1 ? "s" : ""}
        </p>
        {!showCreate ? (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-bold text-white"
          >
            <IconPlus className="h-3.5 w-3.5" /> Ajouter un membre
          </button>
        ) : null}
      </div>

      {lastResult ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13.5px] font-bold text-emerald-800">
              {lastResult.kind === "created" ? "Membre créé" : "Mot de passe réinitialisé"} —{" "}
              {lastResult.name}
            </p>
            <button
              type="button"
              onClick={() => setLastResult(null)}
              aria-label="Fermer"
              className="shrink-0 text-emerald-700 hover:text-emerald-900"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-[12.5px] text-emerald-800">
            Mot de passe temporaire à lui transmettre :
          </p>
          <p className="mt-1 select-all rounded-lg bg-white px-3 py-2 font-mono text-[15px] font-bold tracking-wide text-ink">
            {lastResult.password}
          </p>
          <p className="mt-1.5 text-[12px] leading-snug text-emerald-800">
            {lastResult.name} le remplacera par son propre mot de passe à la première connexion.
          </p>
        </div>
      ) : null}

      {showCreate ? (
        <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div>
            <label className="mb-1 block text-[12.5px] font-bold" htmlFor="newName">
              Prénom
            </label>
            <input
              id="newName"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Camille"
              className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-brand"
            />
          </div>

          <div>
            <span className="mb-1 block text-[12.5px] font-bold">Rôle</span>
            <div className="flex self-start overflow-hidden rounded-full border border-line text-[12.5px] font-semibold">
              {(
                [
                  { value: "user" as const, label: "Membre" },
                  { value: "admin" as const, label: "Administrateur" },
                ]
              ).map((opt, i) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={role === opt.value}
                  onClick={() => setRole(opt.value)}
                  className={`px-3 py-1.5 ${i > 0 ? "border-l border-line" : ""} ${
                    role === opt.value ? "bg-brand text-white" : "bg-surface text-ink-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] font-bold" htmlFor="newPassword">
              Mot de passe temporaire
            </label>
            <div className="flex gap-2">
              <input
                id="newPassword"
                type="text"
                required
                minLength={6}
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                className="flex-1 rounded-xl border border-line px-3 py-2.5 font-mono text-[14px] outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => setCreatePassword(generateTempPassword())}
                className="shrink-0 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-bold text-ink-muted"
              >
                Générer
              </button>
            </div>
          </div>

          {createError ? <p className="text-[12.5px] font-semibold text-red-600">{createError}</p> : null}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-xl bg-brand py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
            >
              {isPending ? "Création…" : "Créer le membre"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-xl border border-line bg-surface px-4 py-2.5 text-[13.5px] font-bold text-ink-muted"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : null}

      <div className="flex flex-col gap-2">
        {members.map((m) => {
          const isSelf = m.id === currentUserId;
          return (
            <div key={m.id} className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar profile={m} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-bold">{m.name}</span>
                      {m.role === "admin" ? (
                        <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-dark">
                          Admin
                        </span>
                      ) : null}
                      {isSelf ? <span className="text-[11.5px] text-ink-muted">· toi</span> : null}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-muted">
                      {!m.password_set ? (
                        <span className="font-semibold text-amber-700">Doit définir son mot de passe</span>
                      ) : m.lastSeenAt ? (
                        <>
                          Actif · vu <Time iso={m.lastSeenAt} relative />
                        </>
                      ) : (
                        "Jamais connecté"
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => (editingId === m.id ? setEditingId(null) : openEdit(m))}
                    className="text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
                  >
                    Modifier
                  </button>
                  {!isSelf ? (
                    <>
                      <button
                        type="button"
                        onClick={() => (resettingId === m.id ? setResettingId(null) : openReset(m.id))}
                        className="text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
                      >
                        Réinitialiser le mot de passe
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(m)}
                        className="text-[12px] font-semibold text-red-600 underline-offset-2 hover:underline"
                      >
                        Supprimer
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {editingId === m.id ? (
                <form
                  onSubmit={(e) => handleEdit(e, m)}
                  className="mt-3 flex flex-col gap-2.5 border-t border-line-soft pt-3"
                >
                  <div>
                    <label className="mb-1 block text-[12px] font-bold" htmlFor={`edit-name-${m.id}`}>
                      Prénom
                    </label>
                    <input
                      id={`edit-name-${m.id}`}
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand"
                    />
                  </div>
                  {!isSelf ? (
                    <div>
                      <span className="mb-1 block text-[12px] font-bold">Rôle</span>
                      <div className="flex self-start overflow-hidden rounded-full border border-line text-[12px] font-semibold">
                        {([
                          { value: "user" as const, label: "Membre" },
                          { value: "admin" as const, label: "Administrateur" },
                        ]).map((opt, i) => (
                          <button
                            key={opt.value}
                            type="button"
                            aria-pressed={editRole === opt.value}
                            onClick={() => setEditRole(opt.value)}
                            className={`px-3 py-1 ${i > 0 ? "border-l border-line" : ""} ${
                              editRole === opt.value ? "bg-brand text-white" : "bg-surface text-ink-muted"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {editError ? (
                    <p className="text-[12px] font-semibold text-red-600">{editError}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isPending}
                      className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                    >
                      <IconCheck className="h-3.5 w-3.5" /> Enregistrer
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-bold text-ink-muted"
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              ) : null}

              {resettingId === m.id ? (
                <form
                  onSubmit={(e) => handleReset(e, m)}
                  className="mt-3 flex flex-col gap-2 border-t border-line-soft pt-3"
                >
                  <label className="text-[12px] font-bold" htmlFor={`reset-${m.id}`}>
                    Nouveau mot de passe temporaire pour {m.name}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={`reset-${m.id}`}
                      type="text"
                      required
                      minLength={6}
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      className="flex-1 rounded-xl border border-line px-3 py-2 font-mono text-[13.5px] outline-none focus:border-brand"
                    />
                    <button
                      type="button"
                      onClick={() => setResetPassword(generateTempPassword())}
                      className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] font-bold text-ink-muted"
                    >
                      Générer
                    </button>
                  </div>
                  {resetError ? (
                    <p className="text-[12px] font-semibold text-red-600">{resetError}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isPending}
                      className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                    >
                      <IconCheck className="h-3.5 w-3.5" /> Réinitialiser
                    </button>
                    <button
                      type="button"
                      onClick={() => setResettingId(null)}
                      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-bold text-ink-muted"
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Supprimer ${deleting.name} ?` : ""}
        body={deleting ? deletionBody(deleting) : undefined}
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && handleDelete(deleting)}
      />
    </div>
  );
}

function deletionBody(m: Member): string {
  const parts: string[] = [];
  if (m.createdTasks > 0) {
    const s = m.createdTasks > 1 ? "s" : "";
    const shared =
      m.sharedTasks > 0 ? ` (dont ${m.sharedTasks} partagée${m.sharedTasks > 1 ? "s" : ""})` : "";
    parts.push(`${m.createdTasks} tâche${s} qu'il a créée${s}${shared}`);
  }
  if (m.authoredComments > 0) {
    parts.push(`${m.authoredComments} commentaire${m.authoredComments > 1 ? "s" : ""}`);
  }
  const removed =
    parts.length > 0 ? `${parts.join(" et ")} seront supprimés définitivement. ` : "";
  return `${removed}Le compte ne pourra plus se connecter.`;
}

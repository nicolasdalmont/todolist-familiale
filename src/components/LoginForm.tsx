"use client";

import { useState, useTransition } from "react";
import { loginAction, setPasswordAction } from "@/lib/actions";
import { Avatar } from "./Avatar";
import type { Profile } from "@/lib/types";

type Step =
  | { name: "pick" }
  | { name: "auth"; profile: Profile; changingPassword: boolean };

export function LoginForm({ profiles }: { profiles: Profile[] }) {
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>({ name: "pick" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function pickProfile(profile: Profile) {
    setError(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setStep({ name: "auth", profile, changingPassword: !profile.password_set });
  }

  function backToGrid() {
    setError(null);
    setStep({ name: "pick" });
  }

  function handleLogin(event: React.FormEvent, profile: Profile) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await loginAction(profile.id, currentPassword);
      if (result?.error) setError(result.error);
      // En cas de succès, loginAction redirige côté serveur — aucun code
      // ne s'exécute après l'await dans ce cas.
    });
  }

  function handleSetPassword(event: React.FormEvent, profile: Profile) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    startTransition(async () => {
      const result = await setPasswordAction(profile.id, currentPassword, newPassword);
      if (result?.error) setError(result.error);
    });
  }

  if (step.name === "pick") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#f6f5fb] p-6">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-br from-brand to-brand-light text-3xl text-white">
            ✓
          </div>
          <h1 className="text-xl font-extrabold">To-Do List Familiale</h1>
          <p className="max-w-xs text-[13.5px] text-ink-muted">Choisis ton profil pour continuer.</p>
        </div>

        <div className="grid w-full max-w-[380px] grid-cols-2 gap-3">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pickProfile(p)}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-2.5 py-[18px] shadow-sm hover:border-brand"
            >
              <Avatar profile={p} size="lg" />
              <span className="text-[13.5px] font-bold">{p.name}</span>
              <span className="text-[11px] text-ink-muted">{p.role === "admin" ? "Administrateur" : "Utilisateur"}</span>
            </button>
          ))}
        </div>

        {profiles.length === 0 ? (
          <p className="max-w-xs text-center text-[13px] text-ink-muted">
            Aucun profil pour l&apos;instant — demande à l&apos;administrateur de créer ton compte.
          </p>
        ) : null}
      </div>
    );
  }

  const { profile, changingPassword } = step;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#f6f5fb] p-6">
      <button
        type="button"
        onClick={backToGrid}
        className="fixed left-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-[17px]"
      >
        ←
      </button>

      <div className="flex flex-col items-center gap-2.5 text-center">
        <Avatar profile={profile} size="lg" />
        <h1 className="text-xl font-extrabold">{profile.name}</h1>
        {!profile.password_set ? (
          <p className="max-w-xs text-[13.5px] text-ink-muted">
            Première connexion : entre le mot de passe temporaire donné par l&apos;administrateur, puis choisis ton
            propre mot de passe.
          </p>
        ) : null}
      </div>

      {changingPassword ? (
        <form
          onSubmit={(e) => handleSetPassword(e, profile)}
          className="flex w-full max-w-[340px] flex-col gap-3.5"
        >
          <div>
            <label className="mb-1.5 block text-[13px] font-bold" htmlFor="currentPassword">
              {profile.password_set ? "Mot de passe actuel" : "Mot de passe temporaire"}
            </label>
            <input
              id="currentPassword"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14.5px] outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-bold" htmlFor="newPassword">
              Nouveau mot de passe
            </label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14.5px] outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-bold" htmlFor="confirmPassword">
              Confirmer le nouveau mot de passe
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14.5px] outline-none focus:border-brand"
            />
          </div>

          {error ? <p className="text-[13px] font-semibold text-rose-600">{error}</p> : null}

          <button
            type="submit"
            disabled={isPending}
            className="mt-1 w-full rounded-xl bg-brand py-3 text-[14.5px] font-bold text-white disabled:opacity-50"
          >
            {isPending ? "Enregistrement..." : "Créer mon mot de passe et me connecter"}
          </button>

          {profile.password_set ? (
            <button
              type="button"
              onClick={() => setStep({ name: "auth", profile, changingPassword: false })}
              className="text-center text-[12.5px] font-semibold text-ink-muted underline"
            >
              Annuler
            </button>
          ) : null}
        </form>
      ) : (
        <form onSubmit={(e) => handleLogin(e, profile)} className="flex w-full max-w-[340px] flex-col gap-3.5">
          <div>
            <label className="mb-1.5 block text-[13px] font-bold" htmlFor="password">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14.5px] outline-none focus:border-brand"
            />
          </div>

          {error ? <p className="text-[13px] font-semibold text-rose-600">{error}</p> : null}

          <button
            type="submit"
            disabled={isPending}
            className="mt-1 w-full rounded-xl bg-brand py-3 text-[14.5px] font-bold text-white disabled:opacity-50"
          >
            {isPending ? "Connexion..." : "Se connecter"}
          </button>

          <button
            type="button"
            onClick={() => {
              setError(null);
              setCurrentPassword("");
              setStep({ name: "auth", profile, changingPassword: true });
            }}
            className="text-center text-[12.5px] font-semibold text-ink-muted underline"
          >
            Changer mon mot de passe
          </button>
        </form>
      )}
    </div>
  );
}

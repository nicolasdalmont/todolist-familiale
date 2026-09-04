"use client";

import { useState, type FormEvent } from "react";
import { changePasswordAction } from "@/lib/actions";
import { useGlobalTransition } from "@/components/PendingOverlay";

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[14.5px] outline-none focus:border-brand";
const labelClass = "mb-1.5 block text-[13px] font-bold";

export function AccountPasswordForm() {
  const [isPending, startTransition] = useGlobalTransition();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);

    if (next !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    startTransition(async () => {
      const res = await changePasswordAction(current, next);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <div>
        <label className={labelClass} htmlFor="currentPassword">
          Mot de passe actuel
        </label>
        <input
          id="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="newPassword">
          Nouveau mot de passe
        </label>
        <input
          id="newPassword"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="confirmPassword">
          Confirmer le nouveau mot de passe
        </label>
        <input
          id="confirmPassword"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </div>

      {error ? <p className="text-[13px] font-semibold text-rose-600">{error}</p> : null}
      {done ? <p className="text-[13px] font-semibold text-emerald-600">Mot de passe mis à jour.</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="mt-1 w-full rounded-xl bg-brand py-3 text-[14.5px] font-bold text-white disabled:opacity-50"
      >
        {isPending ? "Enregistrement..." : "Changer mon mot de passe"}
      </button>
    </form>
  );
}

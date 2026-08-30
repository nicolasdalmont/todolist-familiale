"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setIsSubmitting(false);

    if (signInError) {
      setError("Identifiants incorrects. Vérifie ton e-mail et ton mot de passe.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#f6f5fb] p-6">
      <div className="flex flex-col items-center gap-2.5 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-br from-brand to-brand-light text-3xl text-white">
          ✓
        </div>
        <h1 className="text-xl font-extrabold">To-Do List Familiale</h1>
        <p className="max-w-xs text-[13.5px] text-ink-muted">
          Connecte-toi avec le compte créé par l&apos;administrateur.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full max-w-[340px] flex-col gap-3.5">
        <div>
          <label className="mb-1.5 block text-[13px] font-bold" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14.5px] outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-bold" htmlFor="password">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14.5px] outline-none focus:border-brand"
          />
        </div>

        {error ? <p className="text-[13px] font-semibold text-rose-600">{error}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 w-full rounded-xl bg-brand py-3 text-[14.5px] font-bold text-white disabled:opacity-50"
        >
          {isSubmitting ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

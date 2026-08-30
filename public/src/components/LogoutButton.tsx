"use client";

import { signOutAction } from "@/lib/actions";

export function LogoutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        title="Se déconnecter"
        className="rounded-lg p-1.5 text-lg text-ink-muted hover:bg-slate-100 hover:text-ink"
      >
        ⏻
      </button>
    </form>
  );
}

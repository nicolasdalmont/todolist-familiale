"use client";

import { signOutAction } from "@/lib/actions";
import { IconPower } from "./Icons";

export function LogoutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        title="Se déconnecter"
        className="rounded-lg p-1.5 text-ink-muted hover:bg-sand hover:text-ink"
      >
        <IconPower className="h-[18px] w-[18px]" />
      </button>
    </form>
  );
}

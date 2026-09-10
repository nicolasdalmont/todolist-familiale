"use client";

import { signOutAction } from "@/lib/actions";
import { FormPendingBridge } from "@/components/PendingOverlay";
import { IconPower } from "./Icons";

export function LogoutButton() {
  return (
    <form action={signOutAction}>
      <FormPendingBridge />
      <button
        type="submit"
        title="Se déconnecter"
        aria-label="Se déconnecter"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-sand hover:text-ink"
      >
        <IconPower className="h-[18px] w-[18px]" />
      </button>
    </form>
  );
}

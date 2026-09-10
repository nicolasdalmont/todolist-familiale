"use client";

import { useState } from "react";
import type { Member, UserStats } from "@/lib/types";
import { UserManager } from "./UserManager";
import { UserStatsList } from "./UserStatsList";
import { IconBarChart, IconUsers } from "./Icons";

// Écran /admin réorganisé (voir 6.9) : deux onglets — « Membres »
// (gestion des comptes, la fonction principale) et « Activité »
// (statistiques par membre, inchangées). Réservé au rôle admin, protégé
// côté serveur dans src/app/admin/page.tsx.
type Tab = "members" | "activity";

export function AdminScreen({
  currentUserId,
  members,
  stats,
}: {
  currentUserId: string;
  members: Member[];
  stats: UserStats[];
}) {
  const [tab, setTab] = useState<Tab>("members");

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Sections de l'administration"
        className="flex self-start overflow-hidden rounded-full border border-line text-[13px] font-semibold"
      >
        {(
          [
            { value: "members" as const, label: "Membres", Icon: IconUsers },
            { value: "activity" as const, label: "Activité", Icon: IconBarChart },
          ]
        ).map((t, i) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 ${i > 0 ? "border-l border-line" : ""} ${
              tab === t.value ? "bg-brand text-white" : "bg-surface text-ink-muted"
            }`}
          >
            <t.Icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "members" ? (
        <UserManager currentUserId={currentUserId} members={members} />
      ) : (
        <UserStatsList stats={stats} />
      )}
    </div>
  );
}

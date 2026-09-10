"use client";

import { useState } from "react";
import type { Category, Member, UserStats } from "@/lib/types";
import { UserManager } from "./UserManager";
import { CategoryManager } from "./CategoryManager";
import { UserStatsList } from "./UserStatsList";
import { IconBarChart, IconTag, IconUsers } from "./Icons";

// Écran /admin réorganisé (voir 6.9) : trois onglets — « Membres »
// (gestion des comptes), « Catégories » (catégories de tâches) et
// « Activité » (statistiques par membre). Réservé au rôle admin, protégé
// côté serveur dans src/app/admin/page.tsx.
type Tab = "members" | "categories" | "activity";

export function AdminScreen({
  currentUserId,
  members,
  categories,
  stats,
}: {
  currentUserId: string;
  members: Member[];
  categories: Category[];
  stats: UserStats[];
}) {
  const [tab, setTab] = useState<Tab>("members");

  const tabs = [
    { value: "members" as const, label: "Membres", Icon: IconUsers },
    { value: "categories" as const, label: "Catégories", Icon: IconTag },
    { value: "activity" as const, label: "Activité", Icon: IconBarChart },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Sections de l'administration"
        className="flex self-start overflow-hidden rounded-full border border-line text-[13px] font-semibold"
      >
        {tabs.map((t, i) => (
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
      ) : tab === "categories" ? (
        <CategoryManager categories={categories} />
      ) : (
        <UserStatsList stats={stats} />
      )}
    </div>
  );
}

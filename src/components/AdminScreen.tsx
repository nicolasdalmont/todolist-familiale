"use client";

import { useState } from "react";
import type { AppSettings, Category, Member, UserStats } from "@/lib/types";
import { UserManager } from "./UserManager";
import { CategoryManager } from "./CategoryManager";
import { SettingsPanel } from "./SettingsPanel";
import { UserStatsList } from "./UserStatsList";
import { IconBarChart, IconSliders, IconTag, IconUsers } from "./Icons";

// Écran /admin réorganisé (voir 6.9) : quatre onglets — « Membres »
// (gestion des comptes), « Catégories » (catégories de tâches),
// « Réglages » (rappel + infos d'instance) et « Activité » (statistiques
// par membre). Réservé au rôle admin, protégé côté serveur dans
// src/app/admin/page.tsx.
type Tab = "members" | "categories" | "settings" | "activity";

export function AdminScreen({
  currentUserId,
  members,
  categories,
  settings,
  stats,
}: {
  currentUserId: string;
  members: Member[];
  categories: Category[];
  settings: AppSettings;
  stats: UserStats[];
}) {
  const [tab, setTab] = useState<Tab>("members");

  const tabs = [
    { value: "members" as const, label: "Membres", Icon: IconUsers },
    { value: "categories" as const, label: "Catégories", Icon: IconTag },
    { value: "settings" as const, label: "Réglages", Icon: IconSliders },
    { value: "activity" as const, label: "Activité", Icon: IconBarChart },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Conteneur qui défile horizontalement si les 4 onglets ne tiennent
          pas (petit écran) — évite le débordement hors de la page. Les
          icônes n'apparaissent qu'à partir de sm. */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div
          role="tablist"
          aria-label="Sections de l'administration"
          className="flex w-max overflow-hidden rounded-full border border-line text-[13px] font-semibold"
        >
          {tabs.map((t, i) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 sm:px-3.5 ${
                i > 0 ? "border-l border-line" : ""
              } ${tab === t.value ? "bg-brand text-white" : "bg-surface text-ink-muted"}`}
            >
              <t.Icon className="hidden h-3.5 w-3.5 sm:block" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "members" ? (
        <UserManager currentUserId={currentUserId} members={members} />
      ) : tab === "categories" ? (
        <CategoryManager categories={categories} />
      ) : tab === "settings" ? (
        <SettingsPanel settings={settings} />
      ) : (
        <UserStatsList stats={stats} />
      )}
    </div>
  );
}

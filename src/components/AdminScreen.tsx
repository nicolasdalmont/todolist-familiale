"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AppSettings, Category, Member, RewardAchievement, RewardTier, UserStats } from "@/lib/types";
import { UserManager } from "./UserManager";
import { CategoryManager } from "./CategoryManager";
import { GardenCategoryManager } from "./GardenCategoryManager";
import { SettingsPanel } from "./SettingsPanel";
import { UserStatsList } from "./UserStatsList";
import { RewardManager } from "./RewardManager";
import { HelpButton } from "./HelpButton";
import { IconBarChart, IconGift, IconSliders, IconTag, IconUsers } from "./Icons";

// Écran /admin réorganisé (voir 6.9) : cinq onglets — « Membres » (gestion
// des comptes), « Catégories » (catégories de tâches, puis — second bloc —
// catégories d'activités de jardin, migration 004 : deux gestions
// indépendantes, deux tables séparées, juste co-localisées dans cet onglet),
// « Réglages » (rappel, agendas + infos d'instance), « Activité »
// (statistiques par membre) et « Récompenses » (paliers de gamification,
// migration 002 — voir src/lib/rewards.ts). Réservé au rôle admin, protégé
// côté serveur dans src/app/admin/page.tsx.
type Tab = "members" | "categories" | "settings" | "activity" | "rewards";
const TABS: Tab[] = ["members", "categories", "settings", "activity", "rewards"];

// L'onglet actif vit dans l'URL (?tab=...) plutôt que dans un useState :
// chaque panneau (UserManager, CategoryManager, SettingsPanel, ...) appelle
// router.refresh() après une mutation pour re-synchroniser ses données
// serveur, et un useState local ne survit pas à ce refresh sur cette page
// dynamique (`force-dynamic`) — l'utilisateur se retrouvait renvoyé sur
// « Membres » après la moindre action, quel que soit l'onglet où il se
// trouvait. Dériver l'onglet de l'URL le rend immun à ce remount, puisqu'il
// est recalculé à chaque rendu plutôt que conservé en mémoire.
function useAdminTab(): [Tab, (tab: Tab) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get("tab");
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "members";

  function setTab(next: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return [tab, setTab];
}

// Aide contextuelle : dépend de l'onglet actif (voir HelpButton.tsx), pour
// rester courte et pertinente plutôt qu'une seule aide générique décrivant
// les cinq onglets à la fois.
const HELP_CONTENT: Record<Tab, { title: string; body: React.ReactNode }> = {
  members: {
    title: "Membres",
    body: (
      <>
        <p>Gère les comptes de la famille.</p>
        <ul>
          <li>Créer un membre (prénom, rôle, mot de passe temporaire à lui transmettre).</li>
          <li>Réinitialiser son mot de passe s&apos;il est oublié.</li>
          <li>Supprimer un compte (détaille ce qui part avec lui avant de confirmer).</li>
        </ul>
      </>
    ),
  },
  categories: {
    title: "Catégories",
    body: (
      <>
        <p>Deux gestions indépendantes, l&apos;une sous l&apos;autre :</p>
        <ul>
          <li><strong>Catégories de tâches</strong> : nom, icône, ordre — utilisées partout dans l&apos;appli.</li>
          <li><strong>Catégories d&apos;activités de jardin</strong> : propres à l&apos;onglet Jardin, sans lien avec les précédentes.</li>
        </ul>
      </>
    ),
  },
  settings: {
    title: "Réglages",
    body: (
      <>
        <p>Réglages qui s&apos;appliquent à toute l&apos;instance :</p>
        <ul>
          <li>Rappel d&apos;échéance quotidien (in-app + notification).</li>
          <li>Activation/désactivation de chacun des 4 agendas (Jardin/Voiture/Santé/Finances).</li>
        </ul>
      </>
    ),
  },
  activity: {
    title: "Activité",
    body: (
      <>
        <p>Dernière activité et compteurs de tâches (total, 7 derniers jours, privées/partagées) par membre.</p>
        <p>Volontairement limité à des chiffres : le contenu des tâches privées d&apos;un autre membre n&apos;est jamais visible ici.</p>
      </>
    ),
  },
  rewards: {
    title: "Récompenses",
    body: (
      <>
        <p>Des paliers configurables sur le streak personnel ou les défis familiaux réussis cumulés.</p>
        <ul>
          <li>Créer un palier : seuil + récompense en texte libre (pas de monnaie virtuelle).</li>
          <li>Marquer une récompense atteinte comme donnée une fois remise en vrai.</li>
        </ul>
      </>
    ),
  },
};

export function AdminScreen({
  currentUserId,
  members,
  categories,
  gardenCategories,
  settings,
  stats,
  rewardTiers,
  rewardAchievements,
}: {
  currentUserId: string;
  members: Member[];
  categories: Category[];
  gardenCategories: Category[];
  settings: AppSettings;
  stats: UserStats[];
  rewardTiers: RewardTier[];
  rewardAchievements: RewardAchievement[];
}) {
  const [tab, setTab] = useAdminTab();

  const tabs = [
    { value: "members" as const, label: "Membres", Icon: IconUsers },
    { value: "categories" as const, label: "Catégories", Icon: IconTag },
    { value: "settings" as const, label: "Réglages", Icon: IconSliders },
    { value: "activity" as const, label: "Activité", Icon: IconBarChart },
    { value: "rewards" as const, label: "Récompenses", Icon: IconGift },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {/* Conteneur qui défile horizontalement si les 4 onglets ne tiennent
            pas (petit écran) — évite le débordement hors de la page. Les
            icônes n'apparaissent qu'à partir de sm. */}
        <div className="-mx-4 min-w-0 flex-1 overflow-x-auto px-4">
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
        <HelpButton title={HELP_CONTENT[tab].title}>{HELP_CONTENT[tab].body}</HelpButton>
      </div>

      {tab === "members" ? (
        <UserManager currentUserId={currentUserId} members={members} />
      ) : tab === "categories" ? (
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-bold">Catégories de tâches</h3>
            <CategoryManager categories={categories} />
          </div>
          <div className="border-t border-line-soft pt-6">
            <h3 className="mb-3 text-sm font-bold">Catégories d&apos;activités de jardin</h3>
            <GardenCategoryManager categories={gardenCategories} />
          </div>
        </div>
      ) : tab === "settings" ? (
        <SettingsPanel settings={settings} />
      ) : tab === "activity" ? (
        <UserStatsList stats={stats} />
      ) : (
        <RewardManager tiers={rewardTiers} achievements={rewardAchievements} />
      )}
    </div>
  );
}

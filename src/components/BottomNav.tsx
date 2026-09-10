"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChecklist, IconHome, IconPlus, IconUser } from "./Icons";

// Barre d'onglets en bas d'écran, mobile uniquement (audit UX UX-1) :
// l'app n'avait aucune navigation principale persistante à portée du
// pouce — tout partait de la barre haute de 60 px. Masquée à partir de
// `sm` (desktop garde la barre haute + le bouton flottant). Rendue une
// seule fois, depuis layout.tsx ; se retire elle-même sur l'écran de
// connexion.
export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/login")) return null;

  const items = [
    { href: "/", label: "Accueil", Icon: IconHome, active: pathname === "/" },
    { href: "/tasks", label: "Tâches", Icon: IconChecklist, active: pathname.startsWith("/tasks") && pathname !== "/tasks/new" },
    { href: "/compte", label: "Compte", Icon: IconUser, active: pathname.startsWith("/compte") },
  ];

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-line bg-surface/95 pb-safe backdrop-blur sm:hidden"
    >
      {items.map(({ href, label, Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
            active ? "text-brand" : "text-ink-muted"
          }`}
        >
          <Icon className="h-[22px] w-[22px]" />
          {label}
        </Link>
      ))}
      <Link
        href="/tasks/new"
        aria-label="Nouvelle tâche"
        className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-ink-muted"
      >
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand text-white">
          <IconPlus className="h-3.5 w-3.5" />
        </span>
        Créer
      </Link>
    </nav>
  );
}

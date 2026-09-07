import Link from "next/link";
import type { Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { LogoutButton } from "./LogoutButton";
import { IconBerry } from "./Icons";

export function Topbar({ user }: { user: Profile }) {
  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur">
      <div className="flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-extrabold">
          <IconBerry className="h-[30px] w-[30px]" />
          checkberry
        </Link>
        <Link href="/tasks" className="text-[13px] font-semibold text-ink-muted hover:text-ink">
          Tâches
        </Link>
        {/* Onglet réservé au compte admin — la page elle-même se protège
            aussi côté serveur (voir src/app/admin/page.tsx) : masquer ce
            lien n'est qu'un confort d'affichage, pas le contrôle d'accès. */}
        {user.role === "admin" ? (
          <Link href="/admin" className="text-[13px] font-semibold text-ink-muted hover:text-ink">
            Admin
          </Link>
        ) : null}
      </div>
      <div className="flex items-center gap-2.5">
        <Link href="/compte" title="Mon compte" className="rounded-full hover:opacity-80">
          <Avatar profile={user} />
        </Link>
        <LogoutButton />
      </div>
    </header>
  );
}

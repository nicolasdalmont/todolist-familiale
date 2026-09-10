import Link from "next/link";
import type { Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { LogoutButton } from "./LogoutButton";
import { IconBerry } from "./Icons";
import { APP_NAME } from "@/lib/app-config";

export function Topbar({ user }: { user: Profile }) {
  return (
    <header className="pt-safe sticky top-0 z-20 flex min-h-[60px] items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur">
      <div className="flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-extrabold lowercase">
          <IconBerry className="h-[30px] w-[30px]" />
          {APP_NAME}
        </Link>
        {/* Sur mobile, la navigation passe par la barre d'onglets du bas
            (BottomNav) : « Tâches » y ferait doublon, et « Admin » (rare,
            réservé) est accessible depuis « Mon compte ». On ne garde donc
            ces liens dans le bandeau qu'à partir de sm, où il n'y a pas de
            barre du bas. Le contrôle d'accès admin reste côté serveur
            (src/app/admin/page.tsx) — masquer le lien n'est qu'un confort. */}
        <Link
          href="/tasks"
          className="hidden text-[13px] font-semibold text-ink-muted hover:text-ink sm:block"
        >
          Tâches
        </Link>
        {user.role === "admin" ? (
          <Link
            href="/admin"
            className="hidden text-[13px] font-semibold text-ink-muted hover:text-ink sm:block"
          >
            Admin
          </Link>
        ) : null}
      </div>
      <div className="flex items-center gap-2.5">
        <Link
          href="/compte"
          title="Mon compte"
          aria-label="Mon compte"
          className="tap-target flex rounded-full hover:opacity-80"
        >
          <Avatar profile={user} />
        </Link>
        <LogoutButton />
      </div>
    </header>
  );
}

import type { Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { LogoutButton } from "./LogoutButton";

export function Topbar({ user }: { user: Profile }) {
  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
      <div className="flex items-center gap-2 text-[17px] font-extrabold">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-gradient-to-br from-brand to-brand-light text-white">
          ✓
        </span>
        Todo Familiale
      </div>
      <div className="flex items-center gap-2.5">
        <Avatar profile={user} />
        <LogoutButton />
      </div>
    </header>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { AccountPasswordForm } from "@/components/AccountPasswordForm";
import { IconArrowLeft } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-1">
        <div className="mb-4 mt-1.5 flex items-center gap-2.5">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface"
          >
            <IconArrowLeft className="h-4 w-4" />
          </Link>
          <h2 className="text-lg font-extrabold">Mon compte</h2>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <Avatar profile={profile} size="lg" />
          <div>
            <div className="text-[15px] font-bold">{profile.name}</div>
            <div className="text-[12.5px] text-ink-muted">
              {profile.role === "admin" ? "Administrateur" : "Utilisateur"}
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold">Modifier mon mot de passe</h3>
          <AccountPasswordForm />
        </section>
      </main>
    </div>
  );
}

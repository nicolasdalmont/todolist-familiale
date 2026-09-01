import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfiles } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { TaskForm } from "@/components/TaskForm";

export default async function NewTaskPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const supabase = createAdminClient();
  const profiles = await getProfiles(supabase);

  return (
    <div className="min-h-screen bg-[#f6f5fb]">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pt-1">
        <div className="mb-4 mt-1.5 flex items-center gap-2.5">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-[17px]"
          >
            ←
          </Link>
          <h2 className="text-lg font-extrabold">Nouvelle tâche</h2>
        </div>
        <TaskForm mode="create" profiles={profiles} currentUserId={profile.id} />
      </main>
    </div>
  );
}

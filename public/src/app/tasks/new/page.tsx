import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getProfiles } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { TaskForm } from "@/components/TaskForm";

export default async function NewTaskPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getProfile(supabase, user.id);
  if (!profile) redirect("/login");

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
        <TaskForm mode="create" profiles={profiles} currentUserId={user.id} />
      </main>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfiles, getTask } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { TaskForm } from "@/components/TaskForm";

export default async function EditTaskPage({ params }: { params: { id: string } }) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const supabase = createAdminClient();
  const task = await getTask(supabase, params.id);
  if (!task) notFound();

  const profiles = await getProfiles(supabase);

  return (
    <div className="min-h-screen bg-[#f6f5fb]">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pt-1">
        <div className="mb-4 mt-1.5 flex items-center gap-2.5">
          <Link
            href={`/tasks/${task.id}`}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-[17px]"
          >
            ←
          </Link>
          <h2 className="text-lg font-extrabold">Modifier la tâche</h2>
        </div>
        <TaskForm mode="edit" profiles={profiles} currentUserId={profile.id} task={task} />
      </main>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCategories, getProfiles, getTags, getTask } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { TaskForm } from "@/components/TaskForm";
import { HelpButton } from "@/components/HelpButton";
import { IconArrowLeft } from "@/components/Icons";
import { canEdit } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function EditTaskPage({ params }: { params: { id: string } }) {
  const profile = await requireUser();

  const task = await getTask(params.id, profile.id);
  // Pas de vue "lecture seule" du formulaire : un lecteur qui n'a pas le
  // droit de modifier la tâche est traité comme si cette page n'existait
  // pas, plutôt que de lui montrer un formulaire désactivé.
  if (!task || !canEdit(task, profile.id)) notFound();

  const [profiles, allTags, categories] = await Promise.all([
    getProfiles(),
    getTags(),
    getCategories(),
  ]);

  return (
    <div className="min-h-dvh bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-1 sm:pb-6">
        <div className="mb-4 mt-1.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <Link
              href={`/tasks/${task.id}`}
              aria-label="Retour au détail de la tâche"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface"
            >
              <IconArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="text-lg font-extrabold">Modifier la tâche</h2>
          </div>
          <HelpButton title="Modifier la tâche">
            <p>Les mêmes champs qu&apos;à la création (titre, description, échéance, catégorie, récurrence, tags, partage).</p>
            <ul>
              <li>Le statut se change aussi ici (ou depuis l&apos;écran de détail).</li>
              <li>« Supprimer la tâche » est définitif : commentaires et checklist partent avec elle.</li>
            </ul>
          </HelpButton>
        </div>
        <TaskForm
          mode="edit"
          profiles={profiles}
          allTags={allTags}
          categories={categories}
          currentUserId={profile.id}
          task={task}
        />
      </main>
    </div>
  );
}

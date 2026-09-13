import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAppSettings, getCategories, getProfiles, getTags } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { TaskForm } from "@/components/TaskForm";
import { HelpButton } from "@/components/HelpButton";
import { IconArrowLeft } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const profile = await requireUser();

  const [profiles, allTags, categories, settings] = await Promise.all([
    getProfiles(),
    getTags(),
    getCategories(),
    getAppSettings(),
  ]);

  return (
    <div className="min-h-dvh bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-1 sm:pb-6">
        <div className="mb-4 mt-1.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <Link
              href="/tasks"
              aria-label="Retour à la liste des tâches"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface"
            >
              <IconArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="text-lg font-extrabold">Nouvelle tâche</h2>
          </div>
          <HelpButton title="Nouvelle tâche">
            <p>Titre et description ; l&apos;échéance a des raccourcis (Ce soir, Demain matin...).</p>
            <ul>
              <li>
                Choisir une catégorie <strong>Jardin/Voiture/Santé/Finances</strong> propose de créer
                plutôt une activité dans l&apos;agenda correspondant, en reprenant ta saisie.
              </li>
              <li>La récurrence ne se déclenchera qu&apos;avec une échéance posée.</li>
              <li>
                Le partage est privé par défaut : choisis « Lecture seule » ou « Assigné(e) » pour
                chaque personne.
              </li>
            </ul>
          </HelpButton>
        </div>
        <TaskForm
          mode="create"
          profiles={profiles}
          allTags={allTags}
          categories={categories}
          currentUserId={profile.id}
          settings={settings}
        />
      </main>
    </div>
  );
}

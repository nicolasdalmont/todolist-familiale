import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/queries";
import { isAgendaEnabled, type AgendaKey } from "@/lib/agendas";
import { Topbar } from "@/components/Topbar";
import { HelpButton } from "@/components/HelpButton";
import { IconCar, IconEuro, IconHeart, IconLeaf } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Page d'atterrissage du menu "Agendas" : regroupe les onglets Jardin,
// Voiture, Santé et Finances, qui étaient auparavant des liens de menu
// séparés (Jardin a été déplacé ici, voir Topbar.tsx/BottomNav.tsx). Simple
// page de liens plutôt qu'un sous-menu déroulant — aucun composant de ce
// type n'existe dans le code, et une page reste plus simple à intégrer sans
// changement dans la bottom nav mobile (4 emplacements).
//
// Chaque agenda peut être désactivé individuellement depuis l'admin
// (migration 009 — voir src/lib/agendas.ts) : on ne liste ici que les
// agendas activés. Si aucun n'est activé, le lien qui mène à cette page est
// déjà masqué (Topbar/BottomNav) — un accès direct par l'URL est alors
// traité comme une page inexistante, plutôt que d'afficher une page vide.
const AGENDAS: { key: AgendaKey; href: string; label: string; description: string; Icon: typeof IconLeaf }[] = [
  { key: "jardin", href: "/jardin", label: "Jardin", description: "Taille, semis, plantation…", Icon: IconLeaf },
  { key: "voiture", href: "/voiture", label: "Voiture", description: "Entretien, révision, contrôle technique…", Icon: IconCar },
  { key: "sante", href: "/sante", label: "Santé", description: "Visites médicales, dentiste, vaccins…", Icon: IconHeart },
  { key: "finances", href: "/finances", label: "Finances", description: "Impôts, assurances, abonnements…", Icon: IconEuro },
];

export default async function AgendasPage() {
  const profile = await requireUser();
  const settings = await getAppSettings();
  const agendas = AGENDAS.filter((a) => isAgendaEnabled(settings, a.key));
  if (agendas.length === 0) notFound();

  return (
    <div className="min-h-dvh bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-1 sm:pb-16">
        <div className="mb-4 mt-1.5 flex items-center justify-between gap-2.5">
          <h2 className="text-lg font-extrabold">Agendas</h2>
          <HelpButton title="Agendas">
            <p>
              Chaque agenda regroupe des activités récurrentes propres à un domaine (Jardin, Voiture,
              Santé, Finances) — ouvre l&apos;un d&apos;eux pour le détail de son fonctionnement.
            </p>
            <p>
              L&apos;admin peut désactiver un agenda inutilisé depuis Admin → Réglages : il disparaît
              alors de ce menu, sans perdre ses données.
            </p>
          </HelpButton>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {agendas.map(({ href, label, description, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm hover:border-brand/50"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[14.5px] font-bold text-ink">{label}</p>
                <p className="text-[12.5px] text-ink-muted">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

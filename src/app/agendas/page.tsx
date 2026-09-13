import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Topbar } from "@/components/Topbar";
import { IconCar, IconHeart, IconLeaf } from "@/components/Icons";

export const dynamic = "force-dynamic";

// Page d'atterrissage du menu "Agendas" : regroupe les onglets Jardin,
// Voiture et Santé, qui étaient auparavant des liens de menu séparés
// (Jardin a été déplacé ici, voir Topbar.tsx/BottomNav.tsx). Simple page de
// liens plutôt qu'un sous-menu déroulant — aucun composant de ce type
// n'existe dans le code, et une page reste plus simple à intégrer sans
// changement dans la bottom nav mobile (4 emplacements).
const AGENDAS = [
  { href: "/jardin", label: "Jardin", description: "Taille, semis, plantation…", Icon: IconLeaf },
  { href: "/voiture", label: "Voiture", description: "Entretien, révision, contrôle technique…", Icon: IconCar },
  { href: "/sante", label: "Santé", description: "Visites médicales, dentiste, vaccins…", Icon: IconHeart },
];

export default async function AgendasPage() {
  const profile = await requireUser();

  return (
    <div className="min-h-dvh bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-1 sm:pb-16">
        <h2 className="mb-4 mt-1.5 text-lg font-extrabold">Agendas</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AGENDAS.map(({ href, label, description, Icon }) => (
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

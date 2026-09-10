import type { ReactNode } from "react";

// État vide unifié (audit UX INC-4) : l'appli avait cinq traitements
// différents pour « il n'y a rien ici » (encadré plein, encadré
// pointillé, texte nu, section qui disparaît…). Ce composant en fournit
// un seul — encadré discret à bord pointillé, texte centré et estompé —
// pour les sections d'un écran qui restent affichées même vides (liste de
// tâches, commentaires, checklist, activité du jour). Les fils de type
// « boîte de réception » (À ton attention, Partagées avec toi)
// continuent, eux, à disparaître complètement quand ils sont vides.
export function EmptyState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] leading-relaxed text-ink-muted ${className}`}
    >
      {children}
    </div>
  );
}

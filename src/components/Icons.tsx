// Jeu d'icônes maison en SVG inline (trait fin, coins arrondis), pensé pour
// remplacer les emoji utilisés jusqu'ici. Avantage sur l'emoji : rendu
// identique sur toutes les plateformes/navigateurs, et couleur pilotable via
// `currentColor` (donc via les classes Tailwind text-*). Chaque icône
// accepte une `className` pour la taille et la couleur.

type IconProps = { className?: string };

const base = "shrink-0";

export function IconCheck({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconArrowLeft({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden="true">
      <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPlus({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconPencil({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden="true">
      <path
        d="M4 20l1-4.2L16.2 4.6a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1L8.2 19 4 20Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconCalendar({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconRepeat({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden="true">
      <path d="M4 7.5h11a3.5 3.5 0 0 1 3.5 3.5v1M20 16.5H9A3.5 3.5 0 0 1 5.5 13v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 4.5 4 7.5l3 3M17 19.5l3-3-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconUser({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden="true">
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.8 20c1-3.6 4-5.4 7.2-5.4s6.2 1.8 7.2 5.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconUsers({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 19c.8-3.2 3.2-4.8 6-4.8s5.2 1.6 6 4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15.5 5.6a3 3 0 0 1 0 5.8M18.5 19c-.4-1.8-1.3-3.1-2.6-3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconLock({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconAlertTriangle({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden="true">
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9.5v4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconPower({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden="true">
      <path d="M12 4v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 6.5a7 7 0 1 0 10 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconChat({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden="true">
      <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

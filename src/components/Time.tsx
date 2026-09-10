import { formatDate, relativeTime } from "@/lib/format";

// Enveloppe <time datetime="…"> autour d'une date affichée : le texte reste
// lisible pour tout le monde, et l'instant machine-lisible est exposé aux
// lecteurs d'écran et aux agents (audit UX UX-5). `relative` bascule entre
// « 12 sept. · 14:30 » (formatDate) et « il y a 2 j » (relativeTime).
export function Time({
  iso,
  relative = false,
  className,
}: {
  iso: string | null;
  relative?: boolean;
  className?: string;
}) {
  if (!iso) return <span className={className}>{formatDate(null)}</span>;
  return (
    <time dateTime={iso} className={className}>
      {relative ? relativeTime(iso) : formatDate(iso)}
    </time>
  );
}

// Fuseau horaire de référence de l'application. La famille vit en France :
// toutes les heures **affichées** et **saisies** sont des heures de Paris
// (CET l'hiver, CEST l'été). Les instants restent stockés en UTC dans
// Postgres (`tasks.due_at` est un `timestamptz`) ; ce module fait le pont
// entre "heure murale de Paris" et instant UTC, dans les deux sens, sans
// dépendance externe (l'API `Intl` du runtime suffit).
//
// Pourquoi c'est nécessaire : les Server Actions et Server Components
// tournent en UTC sur Vercel. Sans conversion explicite, une échéance
// « 14:30 » saisie dans le formulaire était stockée telle quelle comme
// 14:30 UTC (soit 16:30 à Paris l'été), et `formatDate` la réaffichait en
// UTC — les deux erreurs se compensaient dans l'appli mais pas ailleurs
// (lien Google Agenda, voir 6.13). On force donc Europe/Paris partout.
export const APP_TIMEZONE = "Europe/Paris";

// Décalage d'un fuseau par rapport à UTC, en minutes, pour un instant donné
// — positif si le fuseau est en avance sur UTC (Paris : +60 l'hiver, +120
// l'été). Robuste au fuseau propre du runtime : on relit l'instant tel que
// l'afficherait le fuseau cible, puis on compare.
export function tzOffsetMinutes(instant: Date, timeZone: string = APP_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return Math.round((wallAsUtc - instant.getTime()) / 60000);
}

// "YYYY-MM-DDTHH:mm" (valeur d'un `<input type="datetime-local">`, sans
// fuseau) comprise comme une heure murale de Paris → instant UTC (chaîne
// ISO). Gère le changement d'heure : on estime d'abord l'instant en
// traitant le mur-horloge comme de l'UTC, puis on le corrige avec le
// décalage de Paris réellement en vigueur à cette date.
export function parisWallTimeToUtcIso(wallTime: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wallTime);
  if (!m) return new Date(wallTime).toISOString();
  const [, y, mo, d, h, mi] = m.map(Number);
  const naiveAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offset = tzOffsetMinutes(new Date(naiveAsUtc));
  return new Date(naiveAsUtc - offset * 60000).toISOString();
}

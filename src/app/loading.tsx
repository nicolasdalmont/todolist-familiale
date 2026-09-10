// Écran d'attente pendant le rendu serveur d'une route (audit UX UX-7) —
// évite un flash blanc sur connexion lente. Volontairement sobre : juste le
// spinner de la marque, centré.
export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper">
      <span
        className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand border-t-transparent"
        role="status"
        aria-label="Chargement"
      />
    </div>
  );
}

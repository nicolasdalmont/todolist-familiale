import Link from "next/link";

// Le statut, la visibilité partagée/privée, la catégorie, les tags et
// l'échéance sont désormais des filtres additionnels dans TaskFilterList
// (voir ce composant) plutôt que des onglets séparés — il n'en reste que
// deux ici, qui changent la portée même de la liste (tout ce qui m'est
// visible, vs. seulement ce que j'ai créé).
const FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "mine", label: "Mes tâches" },
];

export function FilterTabs({ active }: { active: string }) {
  return (
    <div className="mb-2 flex gap-1.5 overflow-x-auto py-3">
      {FILTERS.map((f) => {
        const isActive = f.id === active;
        return (
          <Link
            key={f.id}
            href={f.id === "all" ? "/tasks" : `/tasks?filter=${f.id}`}
            className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-semibold ${
              isActive
                ? "border-brand bg-brand text-white"
                : "border-line bg-surface text-ink-muted hover:border-brand/40"
            }`}
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}

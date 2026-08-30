import Link from "next/link";

const FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "mine", label: "Mes tâches" },
  { id: "shared", label: "Partagées" },
  { id: "private", label: "Privées" },
  { id: "done", label: "Terminées" },
  { id: "archived", label: "Archivées" },
];

export function FilterTabs({ active }: { active: string }) {
  return (
    <div className="mb-2 flex gap-1.5 overflow-x-auto py-3">
      {FILTERS.map((f) => {
        const isActive = f.id === active;
        return (
          <Link
            key={f.id}
            href={f.id === "all" ? "/" : `/?filter=${f.id}`}
            className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-semibold ${
              isActive
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-ink-muted hover:border-brand/40"
            }`}
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}

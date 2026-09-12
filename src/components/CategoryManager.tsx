"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Category } from "@/lib/types";
import {
  createCategoryAction,
  deleteCategoryAction,
  moveCategoryAction,
  updateCategoryAction,
} from "@/lib/category-actions";
import { CATEGORY_ICON_CHOICES, categoryIcon, categoryIconColor, FALLBACK_CATEGORY_SLUG } from "@/lib/categories";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IconArrowLeft, IconCheck, IconPlus } from "./Icons";

// Onglet « Catégories » de l'écran admin (voir AdminScreen.tsx, 6.9 et la
// migration 009). Créer, renommer / changer d'icône, réordonner,
// supprimer une catégorie (les tâches concernées repassent en « Autre »).
function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_ICON_CHOICES.map(({ name, Icon, color }) => (
        <button
          key={name}
          type="button"
          aria-pressed={value === name}
          aria-label={`Icône ${name}`}
          onClick={() => onChange(name)}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
            value === name ? "border-brand bg-brand text-white" : `border-line bg-surface ${color}`
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export function CategoryManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newIcon, setNewIcon] = useState("dots");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editIcon, setEditIcon] = useState("dots");
  const [editError, setEditError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Category | null>(null);

  function run(action: () => Promise<{ error?: string }>, okMessage: string, onOk?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      onOk?.();
      toast.show({ message: okMessage, tone: "success" });
      router.refresh();
    });
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const fd = new FormData();
    fd.set("label", newLabel);
    fd.set("icon", newIcon);
    startTransition(async () => {
      const res = await createCategoryAction(fd);
      if (res.error) {
        setCreateError(res.error);
        return;
      }
      setShowCreate(false);
      setNewLabel("");
      setNewIcon("dots");
      toast.show({ message: "Catégorie créée", tone: "success" });
      router.refresh();
    });
  }

  function openEdit(c: Category) {
    setEditLabel(c.label);
    setEditIcon(c.icon);
    setEditError(null);
    setEditingSlug(c.slug);
  }

  function handleEdit(e: FormEvent, c: Category) {
    e.preventDefault();
    setEditError(null);
    startTransition(async () => {
      const res = await updateCategoryAction(c.slug, { label: editLabel, icon: editIcon });
      if (res.error) {
        setEditError(res.error);
        return;
      }
      setEditingSlug(null);
      toast.show({ message: "Catégorie mise à jour", tone: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-ink-muted">
          {categories.length} catégorie{categories.length > 1 ? "s" : ""}
        </p>
        {!showCreate ? (
          <button
            type="button"
            onClick={() => {
              setNewLabel("");
              setNewIcon("dots");
              setCreateError(null);
              setShowCreate(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-bold text-white"
          >
            <IconPlus className="h-3.5 w-3.5" /> Ajouter une catégorie
          </button>
        ) : null}
      </div>

      {showCreate ? (
        <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div>
            <label className="mb-1 block text-[12.5px] font-bold" htmlFor="newCatLabel">
              Nom
            </label>
            <input
              id="newCatLabel"
              type="text"
              required
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Ex : Jardin"
              className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-brand"
            />
          </div>
          <div>
            <span className="mb-1 block text-[12.5px] font-bold">Icône</span>
            <IconPicker value={newIcon} onChange={setNewIcon} />
          </div>
          {createError ? <p className="text-[12.5px] font-semibold text-red-600">{createError}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-xl bg-brand py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
            >
              {isPending ? "Création…" : "Créer la catégorie"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-xl border border-line bg-surface px-4 py-2.5 text-[13.5px] font-bold text-ink-muted"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : null}

      <div className="flex flex-col gap-2">
        {categories.map((c, i) => {
          const Icon = categoryIcon(c.icon);
          const isFallback = c.slug === FALLBACK_CATEGORY_SLUG;
          return (
            <div key={c.slug} className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-sand ${categoryIconColor(c.icon)}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[14px] font-bold">{c.label}</span>
                  {isFallback ? (
                    <span className="text-[11.5px] text-ink-muted">· repli, non supprimable</span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={isPending || i === 0}
                    aria-label="Monter"
                    onClick={() => run(() => moveCategoryAction(c.slug, "up"), "Ordre mis à jour")}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-sand disabled:opacity-30"
                  >
                    <IconArrowLeft className="h-3.5 w-3.5 rotate-90" />
                  </button>
                  <button
                    type="button"
                    disabled={isPending || i === categories.length - 1}
                    aria-label="Descendre"
                    onClick={() => run(() => moveCategoryAction(c.slug, "down"), "Ordre mis à jour")}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-sand disabled:opacity-30"
                  >
                    <IconArrowLeft className="h-3.5 w-3.5 -rotate-90" />
                  </button>
                  <button
                    type="button"
                    onClick={() => (editingSlug === c.slug ? setEditingSlug(null) : openEdit(c))}
                    className="ml-1 text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
                  >
                    Modifier
                  </button>
                  {!isFallback ? (
                    <button
                      type="button"
                      onClick={() => setDeleting(c)}
                      className="ml-2 text-[12px] font-semibold text-red-600 underline-offset-2 hover:underline"
                    >
                      Supprimer
                    </button>
                  ) : null}
                </div>
              </div>

              {editingSlug === c.slug ? (
                <form
                  onSubmit={(e) => handleEdit(e, c)}
                  className="mt-3 flex flex-col gap-2.5 border-t border-line-soft pt-3"
                >
                  <div>
                    <label className="mb-1 block text-[12px] font-bold" htmlFor={`cat-label-${c.slug}`}>
                      Nom
                    </label>
                    <input
                      id={`cat-label-${c.slug}`}
                      type="text"
                      required
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="w-full rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[12px] font-bold">Icône</span>
                    <IconPicker value={editIcon} onChange={setEditIcon} />
                  </div>
                  {editError ? <p className="text-[12px] font-semibold text-red-600">{editError}</p> : null}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isPending}
                      className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                    >
                      <IconCheck className="h-3.5 w-3.5" /> Enregistrer
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSlug(null)}
                      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-bold text-ink-muted"
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Supprimer la catégorie « ${deleting.label} » ?` : ""}
        body="Les tâches qui l'utilisent repasseront dans « Autre »."
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) run(() => deleteCategoryAction(target.slug), "Catégorie supprimée");
        }}
      />

      <p className="mt-1 text-[12px] text-ink-muted">
        L&apos;ordre ci-dessus est celui des puces du formulaire de tâche et de la liste déroulante
        des filtres.
      </p>
    </div>
  );
}

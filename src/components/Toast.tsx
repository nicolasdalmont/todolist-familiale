"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Petits messages éphémères en bas d'écran — retour d'action (« Tâche
// créée », « Statut : Terminée ») et support du « Annuler » sur les
// suppressions (audit UX UX-3 et INC-10). Volontairement minimal : pas de
// pile infinie, pas d'animation lourde (respecte prefers-reduced-motion),
// au-dessus de la marge de sécurité iOS.

type ToastAction = { label: string; onClick: () => void };

type Toast = {
  id: number;
  message: string;
  tone: "neutral" | "success" | "error";
  action?: ToastAction;
};

type ToastInput = {
  message: string;
  tone?: Toast["tone"];
  action?: ToastAction;
  /** Durée avant disparition (ms). Par défaut 4 s, ou 6 s si une action. */
  duration?: number;
};

const ToastContext = createContext<{ show: (t: ToastInput) => void } | null>(null);

// « Flash » : un message à afficher *après* une navigation déclenchée côté
// serveur (redirect() d'une Server Action — création / modification de
// tâche). Le composant appelant est démonté par la navigation avant de
// pouvoir appeler show() ; on dépose donc le message en sessionStorage
// juste avant de soumettre, et le provider le ramasse au montage suivant.
const FLASH_KEY = "checkberry:flash";

export function setFlash(message: string, tone: Toast["tone"] = "success") {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, tone }));
  } catch {
    /* stockage indisponible : tant pis pour le toast */
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    ({ message, tone = "neutral", action, duration }: ToastInput) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone, action }]);
      const ms = duration ?? (action ? 6000 : 4000);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ms)
      );
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  // Ramasse un éventuel « flash » déposé avant une navigation serveur.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(FLASH_KEY);
      if (raw) sessionStorage.removeItem(FLASH_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const { message, tone } = JSON.parse(raw) as { message: string; tone?: Toast["tone"] };
      if (message) show({ message, tone: tone ?? "success" });
    } catch {
      /* payload illisible : ignoré */
    }
  }, [show]);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex flex-col items-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-xl border px-4 py-3 text-[13.5px] font-semibold shadow-lg motion-safe:animate-[toast-in_.18s_ease-out] ${
              t.tone === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : t.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-line bg-ink text-white"
            }`}
          >
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className={`shrink-0 rounded-lg px-2 py-1 text-[12.5px] font-bold underline-offset-2 hover:underline ${
                  t.tone === "neutral" ? "text-brand-light" : "text-current"
                }`}
              >
                {t.action.label}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Fermer"
              className="shrink-0 text-current opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <style>{`@keyframes toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Rendu hors provider (ne devrait pas arriver — provider monté dans
    // layout.tsx) : no-op plutôt que crash.
    return { show: () => {} };
  }
  return ctx;
}

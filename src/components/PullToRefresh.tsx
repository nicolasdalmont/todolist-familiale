"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

// Tirer vers le bas depuis le haut de l'écran pour rafraîchir — geste
// attendu d'une app mobile, absent d'une PWA installée (pas de chrome
// navigateur, donc pas de pull-to-refresh natif). Ne translate pas le
// contenu (le faire casserait le positionnement des éléments `fixed` :
// bouton +, barre d'onglets) : seul un indicateur circulaire descend du
// haut. `router.refresh()` relit les Server Components sans perdre l'état
// client ; la transition React garde l'indicateur affiché jusqu'à ce que
// le nouvel écran soit rendu.
//
// Actif uniquement sur pointeur grossier (téléphone / tablette). En
// navigateur mobile classique, `overscroll-behavior-y: contain`
// (globals.css) neutralise le pull-to-refresh natif pour éviter le double
// déclenchement.
const TRIGGER = 64; // tirage (après résistance) déclenchant le rafraîchissement
const MAX = 96; // tirage maximal affiché
const RESIST = 0.5; // on n'affiche que la moitié de la distance parcourue

export function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);

  const pullRef = useRef(0);
  const startY = useRef(0);
  const armed = useRef(false);
  const active = useRef(false);
  const refreshing = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const apply = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const stop = () => {
      active.current = false;
      armed.current = false;
      setDragging(false);
    };

    function onStart(e: TouchEvent) {
      if (refreshing.current || e.touches.length !== 1) {
        armed.current = false;
        return;
      }
      // Une action est en cours (overlay « Veuillez patienter ») : on laisse
      // faire.
      if (document.body.style.overflow === "hidden") {
        armed.current = false;
        return;
      }
      armed.current = window.scrollY <= 2;
      startY.current = e.touches[0].clientY;
      active.current = false;
    }

    function onMove(e: TouchEvent) {
      if (!armed.current || refreshing.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 2) {
        if (active.current) {
          apply(0);
          stop();
        }
        return;
      }
      // Tirage vers le bas, en haut de page : on prend la main sur le geste.
      e.preventDefault();
      if (!active.current) {
        active.current = true;
        setDragging(true);
      }
      apply(Math.min(MAX, dy * RESIST));
    }

    function onEnd() {
      if (!active.current) {
        armed.current = false;
        return;
      }
      const trigger = pullRef.current >= TRIGGER;
      stop();
      if (trigger) {
        refreshing.current = true;
        apply(TRIGGER);
        startRefresh(() => router.refresh());
      } else {
        apply(0);
      }
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  // Le rafraîchissement est terminé (les Server Components ont été
  // re-rendus) : on rétracte l'indicateur.
  useEffect(() => {
    if (!isRefreshing && refreshing.current) {
      refreshing.current = false;
      pullRef.current = 0;
      setPull(0);
    }
  }, [isRefreshing]);

  const visible = pull > 2 || isRefreshing;
  const spin = Math.min(1, pull / TRIGGER) * 300;

  return (
    <>
      <div
        aria-hidden={!visible}
        className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex justify-center"
        style={{
          transform: `translateY(calc(${pull - 44}px + env(safe-area-inset-top)))`,
          opacity: visible ? 1 : 0,
          transition: dragging ? "opacity .15s" : "transform .25s ease, opacity .25s ease",
        }}
      >
        <span className="mt-3 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface shadow-md">
          <span
            className={`h-4 w-4 rounded-full border-2 border-brand border-t-transparent ${
              isRefreshing ? "motion-safe:animate-spin" : ""
            }`}
            style={isRefreshing ? undefined : { transform: `rotate(${spin}deg)` }}
            role={isRefreshing ? "status" : undefined}
            aria-label={isRefreshing ? "Rafraîchissement" : undefined}
          />
        </span>
      </div>
      {children}
    </>
  );
}

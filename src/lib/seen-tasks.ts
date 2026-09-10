"use client";

// Suivi local (par appareil) des tâches déjà ouvertes — sert au fil
// « Partagées avec toi » de l'accueil (audit UX UX-12) : une tâche en
// lecture seule y reste listée tant qu'on ne l'a pas consultée. Choix du
// localStorage (pas de table serveur) : enjeu faible, cohérent avec
// l'opt-in des notifications, lui aussi par appareil.
const KEY = "checkberry:seen-tasks";

export function readSeenTaskIds(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markTaskSeen(id: string): void {
  try {
    const ids = readSeenTaskIds();
    if (ids.has(id)) return;
    ids.add(id);
    // Borne la taille : on ne garde que les 300 dernières (ordre d'insertion
    // du Set) — largement au-delà du volume d'une famille, et évite une
    // croissance sans fin sur plusieurs années.
    const arr = Array.from(ids).slice(-300);
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* stockage indisponible : le fil réaffichera la tâche, sans gravité */
  }
}

"use client";

import { useEffect } from "react";
import { markTaskSeen } from "@/lib/seen-tasks";

// Monté sur l'écran de détail d'une tâche (src/app/tasks/[id]/page.tsx) :
// enregistre que cette tâche a été ouverte sur cet appareil, pour qu'elle
// disparaisse du fil « Partagées avec toi » de l'accueil (audit UX UX-12).
// Ne rend rien.
export function MarkTaskSeen({ taskId }: { taskId: string }) {
  useEffect(() => {
    markTaskSeen(taskId);
  }, [taskId]);
  return null;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Lässt die übergeordnete Server-Component regelmäßig neu rendern, damit
 * sich z.B. neue Teilnehmer-Signaturen ohne manuellen Browser-Refresh
 * zeigen. Bewusst simples Polling via `router.refresh()` statt WebSockets
 * — für Coach-Dashboards mit einer Handvoll TN reichen 10s vollkommen
 * und wir sparen uns Pub/Sub-Infrastruktur auf Vercel Serverless.
 *
 * Pausiert sauber wenn der Tab im Hintergrund liegt (Visibility-API) —
 * ein aus dem Fokus gerücktes Fenster triggert sonst stundenlang
 * unnötige Server-Requests.
 */
export function AutoRefresh({
  intervalMs = 10_000,
}: {
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        // Bei Rückkehr aus Hintergrund direkt einmal refreshen und
        // erst dann das Intervall weiterlaufen lassen — fühlt sich
        // für den User direkt „frisch" an.
        router.refresh();
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}

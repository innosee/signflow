"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { markChangelogSeen } from "./actions";

/**
 * Markiert den Changelog beim Öffnen der Seite als gelesen und refresht
 * danach, damit das Header-Badge sofort verschwindet. Läuft genau einmal
 * pro Mount. Rendert nichts.
 */
export function MarkChangelogSeen() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    markChangelogSeen().then(() => {
      if (active) router.refresh();
    });
    return () => {
      active = false;
    };
    // Nur einmal beim Mount — router ist stabil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

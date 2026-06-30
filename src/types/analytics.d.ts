// Global-Typing für das cookieless mini-analytics-Script (site-weit via
// app/layout.tsx eingebunden). Stellt window.track für manuelles Event-
// Tracking bereit. Zur Laufzeit nur vorhanden, wenn das Script geladen ist
// (auf der echten Domain) — Aufrufe daher immer optional chainen.
export {};

declare global {
  interface Window {
    track?: (name: string, meta?: Record<string, unknown>) => void;
  }
}

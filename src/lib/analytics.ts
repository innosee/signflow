// Dünner Wrapper um das globale window.track aus dem mini-analytics-Script
// (site-weit via app/layout.tsx geladen, data-site="ee34940a692a9f04").
//
// window.track existiert erst NACH dem Laden des Scripts und nur im Browser —
// auf dem Server (SSR) und vor dem Script-Load ist der Aufruf ein No-Op.
// Deklaratives Tracking (data-track-Attribute) braucht diesen Helper nicht;
// er ist nur für programmatische Events nach Logik (z.B. erfolgreiche
// Server-Action). Event-Namen bewusst snake_case, damit das Dashboard sauber
// gruppiert. Das Typing für window.track liegt in src/types/analytics.d.ts.
export function track(name: string, meta?: Record<string, unknown>): void {
  if (typeof window !== "undefined" && typeof window.track === "function") {
    window.track(name, meta);
  }
}

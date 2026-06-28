/**
 * Abgeleiteter ANW-/Stundennachweis-Status eines Kurses für das BT-Cockpit.
 *
 * Fasst die drei FES-Gates (`abgeschlossenAt`, `anwCheckPassedAt`,
 * `reviewStatus`) plus den Siegel-/AfA-Stand des `final_documents`-Datensatzes
 * zu EINEM gestuften Status zusammen — damit der Bildungsträger pro Kunde auf
 * einen Blick sieht, wie weit die Anwesenheitsliste Richtung „fertig zum
 * Versand" ist.
 *
 * Bewusst DB-frei + ohne `src/db`-Import → unit-testbar (wie `avgs-stage.ts`).
 * Der Stage wird aus den vorhandenen Feldern berechnet und kann so nie mit
 * ihnen auseinanderlaufen.
 */

export type AnwStatus =
  | "in_arbeit"
  | "abgeschlossen"
  | "anw_check_ok"
  | "review_pending"
  | "changes_requested"
  | "review_approved"
  | "gesiegelt";

export type AnwTone = "idle" | "progress" | "warn" | "ready" | "done";

/**
 * Höchste erreichte Stufe gewinnt. Reihenfolge spiegelt den Workflow:
 * abgeschlossen → ANW-Check → BT-Prüfung → Siegel. Eine angeforderte
 * Nachbesserung (`changes_requested`) wird bewusst als eigener Warn-Status
 * gezeigt, statt auf „abgeschlossen" zurückzufallen.
 */
export function anwStatus(c: {
  abgeschlossenAt: Date | string | null;
  anwCheckPassedAt: Date | string | null;
  reviewStatus: "none" | "pending" | "changes_requested" | "approved";
  fesStatus: "pending" | "sent" | "completed" | null;
}): AnwStatus {
  if (c.fesStatus === "completed") return "gesiegelt";
  if (c.reviewStatus === "approved") return "review_approved";
  if (c.reviewStatus === "pending") return "review_pending";
  if (c.reviewStatus === "changes_requested") return "changes_requested";
  if (c.anwCheckPassedAt) return "anw_check_ok";
  if (c.abgeschlossenAt) return "abgeschlossen";
  return "in_arbeit";
}

export const ANW_STATUS_LABEL: Record<AnwStatus, string> = {
  in_arbeit: "In Arbeit",
  abgeschlossen: "Abgeschlossen",
  anw_check_ok: "ANW-Check ✓",
  review_pending: "BT-Prüfung läuft",
  changes_requested: "Nachbesserung angefordert",
  review_approved: "BT-freigegeben — bereit zum Siegeln",
  gesiegelt: "Gesiegelt",
};

export const ANW_STATUS_TONE: Record<AnwStatus, AnwTone> = {
  in_arbeit: "idle",
  abgeschlossen: "progress",
  anw_check_ok: "progress",
  review_pending: "progress",
  changes_requested: "warn",
  review_approved: "ready",
  gesiegelt: "done",
};

/** Tailwind-Badge-Klassen je Tonalität (Anlehnung an die übrigen Status-Badges). */
export const ANW_TONE_BADGE: Record<AnwTone, string> = {
  idle: "bg-zinc-100 text-zinc-600",
  progress: "bg-amber-100 text-amber-800",
  warn: "bg-red-100 text-red-800",
  ready: "bg-blue-100 text-blue-800",
  done: "bg-emerald-100 text-emerald-800",
};

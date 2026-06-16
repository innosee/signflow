/**
 * AVGS-Maßnahmentyp (§ 45 SGB III) — Codes + Anzeige-Labels an EINER Stelle.
 *
 * Der Maßnahmentyp ist zugleich der angezeigte „Titel" einer Maßnahme: seit
 * 2026-06-16 gibt es kein separates Freitext-Titel-Feld mehr. `courses.title`
 * wird beim Anlegen aus `MASSNAHME_TYP_LABEL[massnahmeTyp]` befüllt, damit alle
 * bestehenden Anzeigen (Header, Listen, PDF, E-Mails) unverändert funktionieren.
 */
export const MASSNAHME_TYPEN = ["EKC", "ESC", "EGC", "ESCA"] as const;

export type MassnahmeTypCode = (typeof MASSNAHME_TYPEN)[number];

export const MASSNAHME_TYP_LABEL: Record<MassnahmeTypCode, string> = {
  EKC: "EKC — Karriere-Coaching",
  ESC: "ESC — Standort-Coaching",
  EGC: "EGC — Gründungs-Coaching",
  ESCA: "ESCA — Ausbildungs-Coaching / Probezeit",
};

export function isMassnahmeTyp(v: string): v is MassnahmeTypCode {
  return (MASSNAHME_TYPEN as readonly string[]).includes(v);
}

/** Anzeige-Titel einer Maßnahme = das Label ihres Typs. */
export function massnahmeTypTitle(typ: MassnahmeTypCode): string {
  return MASSNAHME_TYP_LABEL[typ];
}

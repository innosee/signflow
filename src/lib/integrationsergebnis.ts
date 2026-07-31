import type { MassnahmeTyp } from "@/lib/checker/types";

/**
 * Integrationsergebnis am Ende des TN-bezogenen Berichts (BER).
 *
 * Zwei fachliche Varianten, gesteuert vom Maßnahmentyp des Kunden:
 *   - "vermittlung" (EKC/ESC): Vermittlungserfolg + Datum Beschäftigungsbeginn + Firma
 *   - "gruendung"   (EGC):     Erfolgreiche Gründung + geplantes Gründungsdatum
 *   - ESCA (Probezeitbegleitung) hat KEIN Integrationsergebnis → Variante null.
 *
 * Gespeichert als ein nullable JSONB-Feld auf `abschlussberichte`
 * (`integrationsergebnis`) — analog zu `sessions.eignungsanalyse`.
 *
 * `datum`/`firma` sind nur bei `erfolg === true` fachlich relevant (Pflicht)
 * und werden bei `erfolg === false` auf null normalisiert. `erfolg === null`
 * heißt „noch keine Ja/Nein-Entscheidung" — nur im Entwurf zulässig, beim
 * Einreichen erzwingt {@link validateIntegrationsergebnis} eine Wahl.
 */
export type IntegrationsergebnisVariante = "vermittlung" | "gruendung";

export type Integrationsergebnis = {
  erfolg: boolean | null;
  /** ISO `yyyy-mm-dd`; nur bei erfolg=true relevant. */
  datum: string | null;
  /** Firmenname; nur Variante "vermittlung", nur bei erfolg=true. */
  firma: string | null;
};

/** Leerer Ausgangszustand für den Editor. */
export const EMPTY_INTEGRATIONSERGEBNIS: Integrationsergebnis = {
  erfolg: null,
  datum: null,
  firma: null,
};

export function integrationsergebnisVariante(
  typ: MassnahmeTyp,
): IntegrationsergebnisVariante | null {
  switch (typ) {
    case "EKC":
    case "ESC":
      return "vermittlung";
    case "EGC":
      return "gruendung";
    case "ESCA":
      return null;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIRMA_MAX = 200;

function isIsoDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}

/**
 * Normalisiert Roh-Eingaben (Client-JSON oder DB-Wert) auf die gespeicherte
 * Form: bei erfolg≠true werden Datum/Firma verworfen, Datum wird gegen ISO
 * geprüft, Firma nur bei "vermittlung" übernommen. Gibt null zurück, wenn
 * gar nichts Verwertbares dranhängt.
 */
export function normalizeIntegrationsergebnis(
  raw: unknown,
  variante: IntegrationsergebnisVariante,
): Integrationsergebnis | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const erfolg = typeof r.erfolg === "boolean" ? r.erfolg : null;

  if (erfolg !== true) {
    // Nein oder noch nicht entschieden → keine Detaildaten.
    return { erfolg, datum: null, firma: null };
  }

  const datumRaw = typeof r.datum === "string" ? r.datum.trim() : "";
  const datum = isIsoDate(datumRaw) ? datumRaw : null;
  const firma =
    variante === "vermittlung" && typeof r.firma === "string"
      ? r.firma.trim().slice(0, FIRMA_MAX) || null
      : null;
  return { erfolg, datum, firma };
}

/**
 * Parst den JSON-String aus dem FormData-Feld `integrationsergebnis`.
 * Fehlt/leer/korrupt → null (kein Wert). Für Entwürfe unkritisch.
 */
export function parseIntegrationsergebnisField(
  raw: FormDataEntryValue | null,
  variante: IntegrationsergebnisVariante | null,
): Integrationsergebnis | null {
  if (!variante) return null;
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    return normalizeIntegrationsergebnis(JSON.parse(raw), variante);
  } catch {
    return null;
  }
}

/**
 * Pflicht-Validierung beim Einreichen. Rückgabe = Fehlermeldung oder null (ok).
 * Datum/Firma sind laut Produktentscheidung nur bei „Ja" Pflicht.
 */
export function validateIntegrationsergebnis(
  value: Integrationsergebnis | null,
  variante: IntegrationsergebnisVariante,
): string | null {
  const label = variante === "vermittlung" ? "Vermittlungserfolg" : "Gründungserfolg";
  if (!value || value.erfolg === null) {
    return `Bitte den ${label} angeben (Ja/Nein).`;
  }
  if (value.erfolg === true) {
    if (!value.datum) {
      return variante === "vermittlung"
        ? "Bitte das Datum des Beschäftigungsbeginns angeben."
        : "Bitte das geplante Gründungsdatum angeben.";
    }
    if (variante === "vermittlung" && !value.firma) {
      return "Bitte die Firma angeben, bei der das Beschäftigungsverhältnis beginnt.";
    }
  }
  return null;
}

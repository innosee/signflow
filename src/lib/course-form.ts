import { isBundesland, type Bundesland } from "@/lib/feiertage";
import { MASSNAHME_TYPEN, MASSNAHME_TYP_LABEL } from "@/lib/massnahme-typ";

/**
 * Reine Extraktion + Validierung der Kurs-Formularfelder (Anlegen UND Bearbeiten
 * teilen exakt dieselbe Logik). Bewusst DB-frei und aus der `"use server"`-Datei
 * herausgezogen — damit unit-testbar (server-action-Dateien dürfen nur async
 * Actions exportieren) und ohne `src/db`-Import (sonst zöge der Test ein
 * gesetztes `DATABASE_URL` nach). Die tenant-scoped Referenz-Prüfung
 * (Coach-Team, Bedarfsträger) bleibt mit DB-Zugriff in der Action.
 */

export function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Validierte, geparste Kurs-Formularfelder. */
export type ParsedCourseForm = {
  avgsNummer: string;
  durchfuehrungsort: string;
  anzahlBewilligteUe: number;
  bedarfstraegerId: string;
  /** Kompetenzteam, dedupliziert, Reihenfolge erhalten. */
  coachIds: string[];
  /** `coachIds[0]` — primärer/anlegender Coach (courses.coach_id). */
  primaryCoachId: string;
  massnahmeTyp: (typeof MASSNAHME_TYPEN)[number];
  /** Kein Freitext mehr: Titel = Label des Maßnahmentyps. */
  title: string;
  bundesland: Bundesland;
  /** AVGS-Gutschein-Gültigkeit (Pflicht). Startdatum + erster Termin müssen rein. */
  avgsGueltigVon: string;
  avgsGueltigBis: string;
  /** Nach Erstgespräch vereinbart; bis dahin null (gestufte Erfassung). */
  startDate: string | null;
  /** Bewilligungsende; kommt mit der Bewilligung, bis dahin null. */
  endDate: string | null;
  /** Explizites Bewilligungs-Häkchen (Status "Bewilligt"), entkoppelt vom endDate. */
  bewilligt: boolean;
  customerName: string;
  customerEmail: string;
  customerKundenNr: string;
};

/**
 * Extrahiert + validiert alle Kurs-Formularfelder. Reine Funktion ohne
 * DB-Zugriff — die tenant-scoped Referenz-Prüfung läuft separat (siehe oben).
 */
export function parseCourseForm(
  formData: FormData,
): { ok: true; values: ParsedCourseForm } | { ok: false; error: string } {
  const avgsNummer = String(formData.get("avgsNummer") ?? "").trim();
  const durchfuehrungsort = String(
    formData.get("durchfuehrungsort") ?? "",
  ).trim();
  const anzahlBewilligteUeRaw = String(
    formData.get("anzahlBewilligteUe") ?? "",
  ).trim();
  const bedarfstraegerId = String(formData.get("bedarfstraegerId") ?? "").trim();
  // Kompetenzteam (1–n Coaches). Reihenfolge erhalten, dedupliziert.
  const coachIds = Array.from(
    new Set(
      formData
        .getAll("coachIds")
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  );
  const massnahmeTypRaw = String(formData.get("massnahmeTyp") ?? "").trim();
  const bundeslandRaw = String(formData.get("bundesland") ?? "").trim();
  const avgsGueltigVon = String(formData.get("avgsGueltigVon") ?? "").trim();
  const avgsGueltigBis = String(formData.get("avgsGueltigBis") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  // Checkbox: gesetzt → "on" (oder "true"); nicht angehakt → nicht im FormData.
  const bewilligtRaw = String(formData.get("bewilligt") ?? "").trim();
  const bewilligt = bewilligtRaw === "on" || bewilligtRaw === "true";

  // Kunde (genau einer, 1:1).
  const customerName = String(formData.get("p_name") ?? "").trim();
  const customerEmail = String(formData.get("p_email") ?? "")
    .trim()
    .toLowerCase();
  const customerKundenNr = String(formData.get("p_kundennr") ?? "").trim();

  if (
    !MASSNAHME_TYPEN.includes(massnahmeTypRaw as (typeof MASSNAHME_TYPEN)[number])
  ) {
    return {
      ok: false,
      error: "Ungültiger Maßnahme-Typ. Bitte aus der Liste wählen.",
    };
  }
  const massnahmeTyp = massnahmeTypRaw as (typeof MASSNAHME_TYPEN)[number];
  const title = MASSNAHME_TYP_LABEL[massnahmeTyp];

  // Bundesland ist Pflicht — Grundlage der Feiertags-Warnung.
  if (!isBundesland(bundeslandRaw)) {
    return { ok: false, error: "Bitte ein Bundesland aus der Liste wählen." };
  }
  const bundesland = bundeslandRaw;

  if (
    !avgsNummer ||
    !durchfuehrungsort ||
    !anzahlBewilligteUeRaw ||
    !bedarfstraegerId ||
    coachIds.length === 0 ||
    !avgsGueltigVon ||
    !avgsGueltigBis
  ) {
    return {
      ok: false,
      error: "Bitte alle Kurs-Felder ausfüllen (inkl. mindestens einem Coach).",
    };
  }
  if (!customerName || !customerEmail || !customerKundenNr) {
    return {
      ok: false,
      error: "Kunde braucht Name, E-Mail und Kunden-Nr. (AfA).",
    };
  }
  if (!looksLikeEmail(customerEmail)) {
    return { ok: false, error: "Ungültige E-Mail-Adresse des Kunden." };
  }

  // Strikt ganzzahlig: `parseInt("3.5")` wäre 3 und würde „3.5" still
  // akzeptieren — die Eingabe muss aber reine Ziffern sein (die Meldung
  // verspricht „ganze Zahl"). Führende Nullen sind egal, "0" fängt `<= 0`.
  const anzahlBewilligteUe = Number.parseInt(anzahlBewilligteUeRaw, 10);
  if (!/^\d+$/.test(anzahlBewilligteUeRaw) || anzahlBewilligteUe <= 0) {
    return {
      ok: false,
      error: "Bewilligte UE muss eine positive ganze Zahl sein.",
    };
  }
  // AVGS-Datumslogik (gestufte Erfassung): ISO-Strings (YYYY-MM-DD) sind
  // lexikografisch vergleichbar — wie im Rest des Codes (sessions actions).
  // Jede Prüfung feuert nur, wenn ihr Grenzdatum gesetzt ist.
  if (avgsGueltigBis < avgsGueltigVon) {
    return {
      ok: false,
      error: 'AVGS-Gutschein: „gültig bis" darf nicht vor „gültig von" liegen.',
    };
  }
  if (startDate && (startDate < avgsGueltigVon || startDate > avgsGueltigBis)) {
    return {
      ok: false,
      error: "Startdatum muss innerhalb der AVGS-Gutschein-Gültigkeit liegen.",
    };
  }
  if (startDate && endDate && endDate < startDate) {
    return {
      ok: false,
      error: "Bewilligungsende darf nicht vor dem Startdatum liegen.",
    };
  }

  return {
    ok: true,
    values: {
      avgsNummer,
      durchfuehrungsort,
      anzahlBewilligteUe,
      bedarfstraegerId,
      coachIds,
      primaryCoachId: coachIds[0]!,
      massnahmeTyp,
      title,
      bundesland,
      avgsGueltigVon,
      avgsGueltigBis,
      startDate: startDate || null,
      endDate: endDate || null,
      bewilligt,
      customerName,
      customerEmail,
      customerKundenNr,
    },
  };
}

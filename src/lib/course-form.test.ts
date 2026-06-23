import { describe, expect, it } from "vitest";

import { looksLikeEmail, parseCourseForm } from "./course-form";

/** Baut FormData aus einem Record; `coachIds` darf ein Array sein (Multiselect). */
function fd(
  fields: Record<string, string | string[]>,
): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const v of value) form.append(key, v);
    } else {
      form.set(key, value);
    }
  }
  return form;
}

/** Vollständiger, gültiger Satz Formularfelder — einzelne Tests überschreiben gezielt. */
const validFields = (): Record<string, string | string[]> => ({
  avgsNummer: "12345",
  durchfuehrungsort: "Singen",
  anzahlBewilligteUe: "50",
  bedarfstraegerId: "bt-1",
  coachIds: ["coach-1"],
  massnahmeTyp: "EKC",
  bundesland: "BW",
  startDate: "2026-06-01",
  endDate: "2026-06-30",
  p_name: "Florian Wirtz",
  p_email: "florian@example.com",
  p_kundennr: "123",
});

describe("looksLikeEmail", () => {
  it("akzeptiert plausible Adressen", () => {
    expect(looksLikeEmail("a@b.de")).toBe(true);
    expect(looksLikeEmail("florian.wirtz@example.co.uk")).toBe(true);
  });
  it("lehnt offensichtlich falsche ab", () => {
    expect(looksLikeEmail("kein-at")).toBe(false);
    expect(looksLikeEmail("a@b")).toBe(false);
    expect(looksLikeEmail("a @b.de")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });
});

describe("parseCourseForm — Erfolgsfall", () => {
  it("parst und normalisiert ein vollständiges Formular", () => {
    const result = parseCourseForm(fd(validFields()));
    expect(result.ok).toBe(true);
    if (!result.ok) return; // Narrowing für TS
    expect(result.values).toMatchObject({
      avgsNummer: "12345",
      durchfuehrungsort: "Singen",
      anzahlBewilligteUe: 50,
      bedarfstraegerId: "bt-1",
      massnahmeTyp: "EKC",
      bundesland: "BW",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      customerName: "Florian Wirtz",
      customerKundenNr: "123",
    });
  });

  it("trimmt Felder und lowercased die E-Mail", () => {
    const result = parseCourseForm(
      fd({ ...validFields(), p_email: "  Florian@Example.COM  ", avgsNummer: "  77  " }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.customerEmail).toBe("florian@example.com");
    expect(result.values.avgsNummer).toBe("77");
  });

  it("setzt den Titel aus dem Maßnahmentyp-Label (kein Freitext)", () => {
    const result = parseCourseForm(fd(validFields()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Titel ist NICHT der Code, sondern dessen Anzeige-Label.
    expect(result.values.title).not.toBe("EKC");
    expect(result.values.title.length).toBeGreaterThan(0);
  });

  it("dedupliziert coachIds, erhält die Reihenfolge und nimmt den ersten als primary", () => {
    const result = parseCourseForm(
      fd({ ...validFields(), coachIds: ["coach-2", "coach-1", "coach-2", "  "] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.coachIds).toEqual(["coach-2", "coach-1"]);
    expect(result.values.primaryCoachId).toBe("coach-2");
  });
});

describe("parseCourseForm — Validierungsfehler", () => {
  it("lehnt einen unbekannten Maßnahmentyp ab", () => {
    const result = parseCourseForm(fd({ ...validFields(), massnahmeTyp: "XXX" }));
    expect(result).toEqual({
      ok: false,
      error: "Ungültiger Maßnahme-Typ. Bitte aus der Liste wählen.",
    });
  });

  it("lehnt ein ungültiges Bundesland ab", () => {
    const result = parseCourseForm(fd({ ...validFields(), bundesland: "XX" }));
    expect(result).toEqual({
      ok: false,
      error: "Bitte ein Bundesland aus der Liste wählen.",
    });
  });

  it("verlangt mindestens einen Coach", () => {
    const result = parseCourseForm(fd({ ...validFields(), coachIds: [] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("mindestens einem Coach");
  });

  it("verlangt die Kunden-Stammdaten", () => {
    const result = parseCourseForm(fd({ ...validFields(), p_email: "" }));
    expect(result).toEqual({
      ok: false,
      error: "Kunde braucht Name, E-Mail und Kunden-Nr. (AfA).",
    });
  });

  it("lehnt eine unplausible Kunden-E-Mail ab", () => {
    const result = parseCourseForm(fd({ ...validFields(), p_email: "keine-email" }));
    expect(result).toEqual({
      ok: false,
      error: "Ungültige E-Mail-Adresse des Kunden.",
    });
  });

  it("verlangt eine positive ganzzahlige UE-Zahl", () => {
    for (const bad of ["0", "-5", "abc", "3.5"]) {
      const result = parseCourseForm(fd({ ...validFields(), anzahlBewilligteUe: bad }));
      expect(result.ok, `UE "${bad}" sollte abgelehnt werden`).toBe(false);
      if (result.ok) continue;
      expect(result.error).toContain("positive ganze Zahl");
    }
  });

  it("lehnt ein Enddatum vor dem Startdatum ab", () => {
    const result = parseCourseForm(
      fd({ ...validFields(), startDate: "2026-06-30", endDate: "2026-06-01" }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Enddatum darf nicht vor dem Startdatum liegen.",
    });
  });

  it("erlaubt Start = Ende (eintägige Maßnahme)", () => {
    const result = parseCourseForm(
      fd({ ...validFields(), startDate: "2026-06-15", endDate: "2026-06-15" }),
    );
    expect(result.ok).toBe(true);
  });
});

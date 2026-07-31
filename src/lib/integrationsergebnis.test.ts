import { describe, expect, it } from "vitest";

import {
  integrationsergebnisVariante,
  normalizeIntegrationsergebnis,
  parseIntegrationsergebnisField,
  validateIntegrationsergebnis,
} from "./integrationsergebnis";

describe("integrationsergebnisVariante", () => {
  it("mappt EKC/ESC auf Vermittlung, EGC auf Gründung, ESCA auf null", () => {
    expect(integrationsergebnisVariante("EKC")).toBe("vermittlung");
    expect(integrationsergebnisVariante("ESC")).toBe("vermittlung");
    expect(integrationsergebnisVariante("EGC")).toBe("gruendung");
    expect(integrationsergebnisVariante("ESCA")).toBeNull();
  });
});

describe("normalizeIntegrationsergebnis", () => {
  it("verwirft Datum/Firma bei erfolg=false", () => {
    const r = normalizeIntegrationsergebnis(
      { erfolg: false, datum: "2026-08-01", firma: "ACME" },
      "vermittlung",
    );
    expect(r).toEqual({ erfolg: false, datum: null, firma: null });
  });

  it("erfolg=null bei fehlender Wahl", () => {
    expect(normalizeIntegrationsergebnis({ datum: "2026-08-01" }, "gruendung")).toEqual({
      erfolg: null,
      datum: null,
      firma: null,
    });
  });

  it("übernimmt gültiges Datum + Firma bei Vermittlung/Ja", () => {
    expect(
      normalizeIntegrationsergebnis(
        { erfolg: true, datum: "2026-08-01", firma: "  ACME GmbH  " },
        "vermittlung",
      ),
    ).toEqual({ erfolg: true, datum: "2026-08-01", firma: "ACME GmbH" });
  });

  it("ignoriert Firma bei Gründung", () => {
    expect(
      normalizeIntegrationsergebnis(
        { erfolg: true, datum: "2026-08-01", firma: "ACME" },
        "gruendung",
      ),
    ).toEqual({ erfolg: true, datum: "2026-08-01", firma: null });
  });

  it("verwirft ungültiges Datum", () => {
    expect(
      normalizeIntegrationsergebnis(
        { erfolg: true, datum: "01.08.2026" },
        "gruendung",
      ),
    ).toEqual({ erfolg: true, datum: null, firma: null });
  });

  it("null bei Nicht-Objekt", () => {
    expect(normalizeIntegrationsergebnis(null, "vermittlung")).toBeNull();
    expect(normalizeIntegrationsergebnis("x", "vermittlung")).toBeNull();
  });
});

describe("parseIntegrationsergebnisField", () => {
  it("null bei Variante null (ESCA)", () => {
    expect(parseIntegrationsergebnisField('{"erfolg":true}', null)).toBeNull();
  });
  it("null bei leerem/korruptem JSON", () => {
    expect(parseIntegrationsergebnisField("", "vermittlung")).toBeNull();
    expect(parseIntegrationsergebnisField("{kaputt", "vermittlung")).toBeNull();
  });
  it("parst + normalisiert gültiges JSON", () => {
    expect(
      parseIntegrationsergebnisField(
        '{"erfolg":true,"datum":"2026-08-01","firma":"ACME"}',
        "vermittlung",
      ),
    ).toEqual({ erfolg: true, datum: "2026-08-01", firma: "ACME" });
  });
});

describe("validateIntegrationsergebnis", () => {
  it("verlangt eine Ja/Nein-Wahl", () => {
    expect(validateIntegrationsergebnis(null, "vermittlung")).toMatch(/Ja\/Nein/);
    expect(
      validateIntegrationsergebnis(
        { erfolg: null, datum: null, firma: null },
        "gruendung",
      ),
    ).toMatch(/Ja\/Nein/);
  });

  it("Nein ist vollständig ohne Datum/Firma", () => {
    expect(
      validateIntegrationsergebnis(
        { erfolg: false, datum: null, firma: null },
        "vermittlung",
      ),
    ).toBeNull();
  });

  it("Ja verlangt Datum (Gründung)", () => {
    expect(
      validateIntegrationsergebnis(
        { erfolg: true, datum: null, firma: null },
        "gruendung",
      ),
    ).toMatch(/Gründungsdatum/);
    expect(
      validateIntegrationsergebnis(
        { erfolg: true, datum: "2026-08-01", firma: null },
        "gruendung",
      ),
    ).toBeNull();
  });

  it("Ja verlangt Datum UND Firma (Vermittlung)", () => {
    expect(
      validateIntegrationsergebnis(
        { erfolg: true, datum: "2026-08-01", firma: null },
        "vermittlung",
      ),
    ).toMatch(/Firma/);
    expect(
      validateIntegrationsergebnis(
        { erfolg: true, datum: "2026-08-01", firma: "ACME" },
        "vermittlung",
      ),
    ).toBeNull();
  });
});

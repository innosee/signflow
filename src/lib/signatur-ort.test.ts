import { describe, expect, it } from "vitest";

import { signaturOrt } from "./signatur-ort";

describe("signaturOrt (Ort aus Durchführungsort für die Unterschriftszeile)", () => {
  it("nimmt den Ort hinter der PLZ (Straße + PLZ + Ort)", () => {
    expect(signaturOrt("Stollstraße 5, 83022 Rosenheim")).toBe("Rosenheim");
    expect(signaturOrt("Grimmenstein 25, 88364 Wolfegg")).toBe("Wolfegg");
  });

  it("nimmt den Ort hinter der PLZ auch ohne Straße", () => {
    expect(signaturOrt("78224 Singen")).toBe("Singen");
  });

  it("schneidet ein Land/Zusatz nach dem Ort ab", () => {
    expect(signaturOrt("Musterstr. 1, 12345 Berlin, Deutschland")).toBe(
      "Berlin",
    );
  });

  it("lässt einen reinen Ort unverändert", () => {
    expect(signaturOrt("Singen")).toBe("Singen");
  });

  it('lässt "Online" unverändert', () => {
    expect(signaturOrt("Online")).toBe("Online");
  });

  it("nimmt bei Komma ohne PLZ den letzten Teil", () => {
    expect(signaturOrt("Volkshochschule, Konstanz")).toBe("Konstanz");
  });

  it("zieht den Sitz aus der mehrzeiligen Postanschrift des Trägers", () => {
    // users.pdf_address — Telefon/Mail/Web dürfen NICHT in die Signaturzeile
    // rutschen (sonst unterschreibt der Träger mit „Singen\nTel. …").
    expect(
      signaturOrt(
        "Ekkehardstraße 12b\nD-78224 Singen\nTel. +49 (0) 7731 / 90 97 18 - 10\navgs@erango.de\nwww.erango.de",
      ),
    ).toBe("Singen");
  });

  it("nimmt bei mehrzeiligem Input ohne PLZ die erste nicht-leere Zeile", () => {
    expect(signaturOrt("\n  Singen  \nTel. 07731\n")).toBe("Singen");
  });

  it("gibt bei leer/None einen leeren String zurück", () => {
    expect(signaturOrt("")).toBe("");
    expect(signaturOrt("   ")).toBe("");
    expect(signaturOrt(null)).toBe("");
    expect(signaturOrt(undefined)).toBe("");
  });
});

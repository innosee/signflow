import { describe, expect, it } from "vitest";

import { scrubMessages, scrubPii } from "./scrub-pii";

describe("scrubPii", () => {
  it("ersetzt E-Mail-Adressen", () => {
    expect(scrubPii("Erreichbar unter max.mustermann@example.de bitte")).toBe(
      "Erreichbar unter [E-Mail] bitte",
    );
  });

  it("ersetzt deutsche IBANs mit und ohne Leerzeichen", () => {
    expect(scrubPii("IBAN DE89370400440532013000 angegeben")).toBe(
      "IBAN [IBAN] angegeben",
    );
    expect(scrubPii("DE89 3704 0044 0532 0130 00")).toBe("[IBAN]");
  });

  it("ersetzt BA-Kundennummern (3 Ziffern + Buchstabe + 5 Ziffern)", () => {
    expect(scrubPii("Kundennummer 123A45678 vom Bescheid")).toBe(
      "Kundennummer [Kunden-Nr] vom Bescheid",
    );
  });

  it("ersetzt Telefonnummern in gängigen Formaten", () => {
    expect(scrubPii("Ruf mich an: +49 176 12345678")).toBe(
      "Ruf mich an: [Telefonnummer]",
    );
    expect(scrubPii("Festnetz 0761/123456 tagsüber")).toBe(
      "Festnetz [Telefonnummer] tagsüber",
    );
    expect(scrubPii("Mobil 0176-1234567")).toBe("Mobil [Telefonnummer]");
  });

  it("lässt Datumsangaben stehen", () => {
    expect(scrubPii("Termin am 01.02.2026 um 10 Uhr")).toBe(
      "Termin am 01.02.2026 um 10 Uhr",
    );
  });

  it("ersetzt Anrede + Name", () => {
    expect(scrubPii("Frau Müller kommt nicht weiter")).toBe(
      "[Name] kommt nicht weiter",
    );
    expect(scrubPii("Ich habe Herrn Max Mustermann eingeladen")).toBe(
      "Ich habe [Name] eingeladen",
    );
    expect(scrubPii("Termin mit Herrn Dr. Schmidt-Bauer")).toBe(
      "Termin mit [Name]",
    );
  });

  it("ersetzt Rollenwort + vollen Namen, behält das Rollenwort", () => {
    expect(scrubPii("Mein Teilnehmer Max Mustermann signiert nicht")).toBe(
      "Mein Teilnehmer [Name] signiert nicht",
    );
    expect(scrubPii("Die Teilnehmerin Erika Musterfrau hat kein Handy")).toBe(
      "Die Teilnehmerin [Name] hat kein Handy",
    );
  });

  it("lässt Bedienungsfragen ohne PII unverändert", () => {
    const q = "Wie lege ich einen Termin mit 4 UE an?";
    expect(scrubPii(q)).toBe(q);
  });

  it("ersetzt mehrere Treffer im selben Text", () => {
    expect(
      scrubPii("Frau Müller (0176 1234567, erika@example.com) fragt"),
    ).toBe("[Name] ([Telefonnummer], [E-Mail]) fragt");
  });
});

describe("scrubMessages", () => {
  it("scrubbt jede Nachricht und behält die Rollen", () => {
    const result = scrubMessages([
      { role: "user", content: "Herr Meier braucht einen Link" },
      { role: "assistant", content: "Gern — welcher Kurs?" },
    ]);
    expect(result).toEqual([
      { role: "user", content: "[Name] braucht einen Link" },
      { role: "assistant", content: "Gern — welcher Kurs?" },
    ]);
  });
});

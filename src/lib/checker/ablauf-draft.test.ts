import { describe, expect, it } from "vitest";

import { buildAblaufDraft, type AblaufDraftSession } from "./ablauf-draft";

const s = (topic: string, isErstgespraech = false): AblaufDraftSession => ({
  topic,
  isErstgespraech,
});

describe("buildAblaufDraft", () => {
  it("listet reguläre Termin-Themen chronologisch + nennt Maßnahmetyp + Termin-Zahl", () => {
    const text = buildAblaufDraft(
      [s("Businessplan"), s("Marktanalyse"), s("Finanzplanung")],
      "EGC",
    );
    expect(text).toContain("Gründungs-Coachings");
    expect(text).toContain("über 3 Termine");
    expect(text).toContain("Businessplan; Marktanalyse; Finanzplanung");
    expect(text).toContain("Anwesenheitsnachweis");
  });

  it("erfindet nichts — nutzt exakt die Themen", () => {
    const text = buildAblaufDraft([s("Bewerbungsunterlagen")], "EKC");
    expect(text).toContain("Bewerbungsunterlagen");
    expect(text).toContain("über 1 Termin ");
    expect(text).not.toContain("über 1 Termine");
  });

  it("dedupliziert gleiche Themen, behält Reihenfolge", () => {
    const text = buildAblaufDraft(
      [s("Marktanalyse"), s("marktanalyse"), s("Pitch")],
      "EGC",
    );
    // „über 3 Termine", aber Thema nur einmal gelistet
    expect(text).toContain("über 3 Termine");
    expect(text.match(/[Mm]arktanalyse/g)?.length).toBe(1);
    expect(text).toContain("Marktanalyse; Pitch");
  });

  it("nimmt das Erstgespräch nicht in die Themenliste, erwähnt es aber", () => {
    const text = buildAblaufDraft(
      [s("Erstgespräch", true), s("Zielarbeit")],
      "EKC",
    );
    expect(text).toContain("Den Auftakt bildete das Erstgespräch");
    expect(text).toContain("über 1 Termin ");
    expect(text).toContain("Zielarbeit");
  });

  it("fällt sauber zurück, wenn nur ein Erstgespräch existiert", () => {
    const text = buildAblaufDraft([s("Erstgespräch", true)], "ESCA");
    expect(text).toContain("vereinbarten Inhalte");
    expect(text).toContain("Erstgespräch");
  });
});

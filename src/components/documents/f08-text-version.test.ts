import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { F08Teilnehmervertrag } from "@/components/documents/f08-teilnehmervertrag";
import type { DocumentSheetData } from "@/components/documents/types";
import { getDocumentConfig, TEXT_VERSION_KEY } from "@/lib/documents/config";

// Freigegebene/signierte Verträge rendern live aus dem Template. Eine
// Textänderung darf sie NICHT rückwirkend umschreiben: ohne eingefrorene
// `text_version` im Snapshot bleibt es bei Fassung 1.

function sheet(
  status: DocumentSheetData["status"],
  formData: Record<string, string> = {},
): DocumentSheetData {
  return {
    documentId: "doc",
    type: "f08_tnv",
    status,
    formData,
    branding: { logoUrl: null },
    orgSignatureUrl: null,
    participant: {
      name: "Test Person",
      vorname: "Test",
      nachname: "Person",
      strasse: null,
      plz: null,
      ort: null,
      geburtsdatum: null,
      geburtsort: null,
      phone: null,
      festnetz: null,
      email: "test@example.com",
      kundenNr: "123",
    },
    course: {
      title: "EKC",
      massnahmeTyp: "EKC",
      massnahmeLabel: "EKC",
      durchfuehrungsort: "Singen",
      avgsNummer: "1",
      anzahlBewilligteUe: 80,
      geleisteteUe: null,
      startDate: null,
      endDate: null,
      letzterTermin: null,
    },
    coachName: "Coach",
    signatures: { coach: null, participant: null },
  };
}

const render = (data: DocumentSheetData) =>
  renderToStaticMarkup(createElement(F08Teilnehmervertrag, { data }));

const V1 = "Eine Drittlandübermittlung findet nicht statt.";
const V2 = "innosee GmbH";

describe("F08 Vertragstext-Fassung", () => {
  it("friert bei der Freigabe Fassung 2 ein", () => {
    expect(getDocumentConfig("f08_tnv").textVersion).toBe("2");
  });

  it("zeigt Entwürfen den aktuellen Text", () => {
    const html = render(sheet("draft"));
    expect(html).toContain(V2);
    expect(html).not.toContain(V1);
  });

  it("lässt vor der Umstellung freigegebene Verträge bei Fassung 1", () => {
    for (const status of ["active", "completed"] as const) {
      const html = render(sheet(status));
      expect(html).toContain(V1);
      expect(html).not.toContain(V2);
    }
  });

  it("rendert mit eingefrorener Fassung 2 den neuen Text", () => {
    const html = render(sheet("completed", { [TEXT_VERSION_KEY]: "2" }));
    expect(html).toContain(V2);
    expect(html).not.toContain(V1);
  });
});

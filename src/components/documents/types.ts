import type { DocumentTypeId } from "@/lib/documents/config";

/**
 * Normalisierte Daten für die Dokument-Vorlagen (Screen + Print/PDF).
 * Erzeugt von `loadDocumentSheet` (`src/lib/documents/data.ts`).
 */
export type DocumentSheetData = {
  documentId: string;
  type: DocumentTypeId;
  status: "draft" | "active" | "completed";
  /** Vom Coach ausgefüllte Feldwerte (Snapshot). Struktur je Typ in config.ts. */
  formData: Record<string, string>;
  branding: {
    /** Aufgelöstes Logo-URL des Tenants oder null (dann Text-Fallback). */
    logoUrl: string | null;
  };
  participant: {
    name: string;
    vorname: string | null;
    nachname: string | null;
    strasse: string | null;
    plz: string | null;
    ort: string | null;
    /** ISO-Datum (yyyy-mm-dd) oder null. */
    geburtsdatum: string | null;
    geburtsort: string | null;
    /** Mobilfunknummer. */
    phone: string | null;
    festnetz: string | null;
    email: string;
    kundenNr: string;
  };
  course: {
    title: string;
    massnahmeLabel: string;
    durchfuehrungsort: string;
    avgsNummer: string;
    anzahlBewilligteUe: number;
    startDate: string | null;
    endDate: string | null;
  };
  coachName: string;
  signatures: {
    coach: { url: string | null; signedAt: string } | null;
    participant: { url: string | null; signedAt: string } | null;
  };
};

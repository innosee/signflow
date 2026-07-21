/**
 * Konfiguration der digitalisierten erango-Formulare („Kunde-Dokumente").
 *
 * Bewusst **rein** (keine DB-/`server-only`-Imports), damit sowohl der
 * Server-Prefill als auch der Client-Editor (Coach) dieselben Feld-Definitionen
 * nutzen. Der statische Rechtstext der Formulare lebt in den Template-
 * Komponenten (`src/components/documents/*`); hier stehen nur die editier- und
 * vorbefüllbaren Felder plus die pro Dokument geforderten Teilnehmer-Stammdaten.
 *
 * Neues Formular ergänzen: Enum-Wert (`document_type`) + Config-Eintrag hier +
 * Template-Komponente + Prefill-Zweig.
 */

export type DocumentTypeId = "f04_ds" | "f08_tnv" | "f21_stv";

export const DOCUMENT_TYPE_IDS: DocumentTypeId[] = ["f04_ds", "f08_tnv", "f21_stv"];

export type DocFieldType = "text" | "textarea" | "select" | "date";

export type DocField = {
  /** Schlüssel in `documents.form_data`. */
  key: string;
  label: string;
  type: DocFieldType;
  options?: { value: string; label: string }[];
  /** Muss beim Coach-Signieren gefüllt sein, sonst wird die Signatur blockiert. */
  required?: boolean;
  placeholder?: string;
  hint?: string;
};

/**
 * Erweiterte Teilnehmer-Stammdaten (Spalten in `participants`). `phone` =
 * Mobilfunknummer (bestehende Spalte), `festnetz` = separate Festnetznummer.
 */
export type ParticipantMasterField =
  | "vorname"
  | "nachname"
  | "strasse"
  | "plz"
  | "ort"
  | "geburtsdatum"
  | "geburtsort"
  | "phone"
  | "festnetz";

export const MASTER_FIELD_LABELS: Record<ParticipantMasterField, string> = {
  vorname: "Vorname",
  nachname: "Nachname",
  strasse: "Straße / Hausnummer",
  plz: "PLZ",
  ort: "Ort",
  geburtsdatum: "Geburtsdatum",
  geburtsort: "Geburtsort",
  phone: "Mobilfunknummer",
  festnetz: "Festnetznummer",
};

export type DocumentConfig = {
  id: DocumentTypeId;
  /** Formularnummer im erango-System, z.B. "F 08". */
  formNumber: string;
  /** Kurzname für Buttons/Listen, z.B. "Teilnehmervertrag". */
  label: string;
  /** Voller Titel wie im Dokument-Header. */
  fullTitle: string;
  /** Ein-Satz-Beschreibung für die Auswahl. */
  description: string;
  /** Vom Coach ausgefüllte Felder (Snapshot in `documents.form_data`). */
  fields: DocField[];
  /** Für dieses Dokument verpflichtende Teilnehmer-Stammdaten. */
  requiredMasterData: ParticipantMasterField[];
};

const F04: DocumentConfig = {
  id: "f04_ds",
  formNumber: "F 04",
  label: "Datenschutzerklärung",
  fullTitle: "Datenschutzerklärung",
  description:
    "Datenschutzhinweise nach Art. 13/14 DSGVO für Teilnehmer:innen von AVGS-Einzelcoachings.",
  // Reiner Rechtstext + zwei Unterschriften. Ort wird vorbefüllt, Datum ergibt
  // sich aus dem Signatur-Zeitstempel — kein weiteres Coach-Freitextfeld.
  fields: [
    {
      key: "ort",
      label: "Ort (für die Unterschriftszeile)",
      type: "text",
      required: true,
      placeholder: "z.B. Singen",
    },
  ],
  requiredMasterData: [],
};

const F08: DocumentConfig = {
  id: "f08_tnv",
  formNumber: "F 08",
  label: "Teilnehmervertrag",
  fullTitle: "Teilnehmervertrag / Anmeldung I AVGS",
  description:
    "Verbindliche Anmeldung zur AVGS-Maßnahme inkl. Stamm- und Maßnahmedaten.",
  fields: [
    {
      key: "massnahme",
      label: "Maßnahme",
      type: "text",
      required: true,
      placeholder: "z.B. Karrierecoaching (EKC)",
    },
    {
      key: "ort",
      label: "Ort (Durchführung)",
      type: "text",
      required: true,
    },
    {
      key: "anzahlUe",
      label: "Anzahl UE",
      type: "text",
      required: true,
      placeholder: "z.B. 80",
    },
    {
      key: "ueProWoche",
      label: "UE pro Woche",
      type: "text",
      required: true,
      placeholder: "min. 2 Termine/Woche á … UE",
    },
    {
      key: "beginn",
      label: "Beginn",
      type: "date",
      required: true,
    },
    {
      key: "voraussEnde",
      label: "vorauss. Ende",
      type: "date",
      required: true,
    },
  ],
  // F 08 ist das einzige Formular mit vollständigen Personendaten. Geburtsort +
  // Festnetz bleiben optional (siehe Abstimmung mit erango).
  requiredMasterData: [
    "vorname",
    "nachname",
    "strasse",
    "plz",
    "ort",
    "geburtsdatum",
    "phone",
  ],
};

const F21: DocumentConfig = {
  id: "f21_stv",
  formNumber: "F 21",
  label: "Strategievereinbarung",
  fullTitle: "Strategievereinbarung",
  description:
    "Individuelle Ziel- und Arbeitsvereinbarung zwischen Teilnehmer:in und Coach.",
  fields: [
    {
      key: "eckdaten",
      label: "Eckdaten des Teilnehmers",
      type: "textarea",
      hint: "Kurze Beschreibung (Studium, Ausbildung, Erfahrungen, Kenntnisse, Fähigkeiten, Interessen zu Beginn).",
    },
    {
      key: "arbeitsweise",
      label: "Unsere Arbeitsweise",
      type: "select",
      required: true,
      options: [
        { value: "online", label: "Online" },
        { value: "praesenz", label: "Präsenz" },
        { value: "hybrid", label: "Hybrid" },
      ],
    },
    {
      key: "ziele",
      label: "Unsere individuellen Ziele / Bewilligungsinhalte",
      type: "textarea",
    },
    {
      key: "abwesenheitszeiten",
      label: "Bereits bekannte Abwesenheitszeiten",
      type: "textarea",
    },
    {
      key: "ort",
      label: "Ort (für die Unterschriftszeile)",
      type: "text",
      required: true,
      placeholder: "z.B. Singen",
    },
  ],
  requiredMasterData: [],
};

const CONFIGS: Record<DocumentTypeId, DocumentConfig> = {
  f04_ds: F04,
  f08_tnv: F08,
  f21_stv: F21,
};

export function getDocumentConfig(type: DocumentTypeId): DocumentConfig {
  return CONFIGS[type];
}

export function isDocumentType(value: string): value is DocumentTypeId {
  return (DOCUMENT_TYPE_IDS as string[]).includes(value);
}

/** Alle Konfigurationen in fester Reihenfolge (für Auswahl-Listen). */
export function allDocumentConfigs(): DocumentConfig[] {
  return DOCUMENT_TYPE_IDS.map((id) => CONFIGS[id]);
}

// --- Prefill ---------------------------------------------------------------

export type PrefillInput = {
  /** Maßnahmentyp-Label inkl. Kürzel, z.B. "Karrierecoaching (EKC)". */
  massnahmeLabel: string;
  durchfuehrungsort: string;
  anzahlBewilligteUe: number;
  /** ISO-Datum (yyyy-mm-dd) oder null. */
  startDate: string | null;
  endDate: string | null;
};

/**
 * Deterministischer Prefill der `form_data` aus Kurs-/Maßnahmedaten. Keine KI —
 * nur bekannte Werte aus dem Kurs. Leere Werte bleiben leer (Coach füllt sie).
 */
export function prefillFormData(
  type: DocumentTypeId,
  input: PrefillInput,
): Record<string, string> {
  switch (type) {
    case "f04_ds":
      return { ort: input.durchfuehrungsort || "" };
    case "f08_tnv":
      return {
        massnahme: input.massnahmeLabel,
        ort: input.durchfuehrungsort || "",
        anzahlUe: input.anzahlBewilligteUe ? String(input.anzahlBewilligteUe) : "",
        ueProWoche: "min. 2 Termine/Woche",
        beginn: input.startDate ?? "",
        voraussEnde: input.endDate ?? "",
      };
    case "f21_stv":
      return {
        eckdaten: "",
        arbeitsweise: "online",
        ziele: "",
        abwesenheitszeiten: "",
        ort: input.durchfuehrungsort || "",
      };
  }
}

// --- Validierung -----------------------------------------------------------

export type ParticipantMasterData = Partial<
  Record<ParticipantMasterField, string | null | undefined>
>;

/**
 * Liefert die für dieses Dokument fehlenden Pflicht-Stammdaten (leere Liste =
 * vollständig). Wird beim Coach-Signieren als harte Hürde ausgewertet.
 */
export function missingMasterData(
  type: DocumentTypeId,
  data: ParticipantMasterData,
): ParticipantMasterField[] {
  const cfg = getDocumentConfig(type);
  return cfg.requiredMasterData.filter((f) => {
    const v = data[f];
    return v == null || String(v).trim() === "";
  });
}

/**
 * Liefert die fehlenden Pflicht-Formularfelder (leere Liste = vollständig).
 */
export function missingRequiredFields(
  type: DocumentTypeId,
  formData: Record<string, unknown>,
): DocField[] {
  const cfg = getDocumentConfig(type);
  return cfg.fields.filter((f) => {
    if (!f.required) return false;
    const v = formData[f.key];
    return v == null || String(v).trim() === "";
  });
}

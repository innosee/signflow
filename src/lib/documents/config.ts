/**
 * Konfiguration der digitalisierten erango-Formulare („Kunde-Dokumente").
 *
 * Bewusst **rein** (keine DB-/`server-only`-Imports), damit sowohl der
 * Server-Prefill als auch der Client-Editor (Coach) dieselben Feld-Definitionen
 * nutzen. Der statische Rechtstext der Formulare lebt in den Template-
 * Komponenten (`src/components/documents/*`); hier stehen nur die editier- und
 * vorbefüllbaren Felder, die Signatur-Konfiguration und die pro Dokument
 * geforderten Teilnehmer-Stammdaten.
 *
 * Neues Formular ergänzen: Enum-Wert (`document_type`) + Config-Eintrag hier +
 * Template-Komponente + Prefill-Zweig.
 */

export type DocumentTypeId =
  | "f04_ds"
  | "f08_tnv"
  | "f21_stv"
  | "tnv_ds_merge";

// Reihenfolge in der Auswahl-Liste: STV, TNV, DS, kombiniertes TNV+DS.
export const DOCUMENT_TYPE_IDS: DocumentTypeId[] = [
  "f21_stv",
  "f08_tnv",
  "f04_ds",
  "tnv_ds_merge",
];

/**
 * Wer ein Dokument anlegt, ausfüllt und (auf der erango-Seite) signiert:
 * - `bildungstraeger` = Datenschutz (F04), Teilnehmervertrag (F08),
 *   TNV+DS-Merge. Die zweite Signaturzeile ist die geteilte
 *   Organisations-Unterschrift („erango Mitarbeiter:in").
 * - `coach` = Strategievereinbarung (F21). Zweite Zeile = Coach-Unterschrift.
 * Die jeweils andere Rolle sieht die Dokumente nur read-only (+ PDF-Download).
 */
export type DocumentOwner = "bildungstraeger" | "coach";

export type DocFieldType = "text" | "textarea" | "select" | "date";

export type DocField = {
  /** Schlüssel in `documents.form_data`. */
  key: string;
  label: string;
  type: DocFieldType;
  options?: { value: string; label: string }[];
  /** Muss beim Freigeben/Signieren gefüllt sein, sonst wird es blockiert. */
  required?: boolean;
  placeholder?: string;
  hint?: string;
};

/**
 * Erweiterte Teilnehmer-Stammdaten (Spalten in `participants`). `phone` =
 * Mobilfunknummer (bestehende Spalte), `festnetz` = separate Festnetznummer.
 * Geburtsdatum ist bewusst NICHT dabei — erango hat es bei AVGS-TN praktisch nie
 * vorliegen (Abstimmung 2026-07-21). Die DB-Spalte bleibt, wird aber nicht
 * mehr erfasst/angezeigt.
 */
export type ParticipantMasterField =
  | "vorname"
  | "nachname"
  | "strasse"
  | "plz"
  | "ort"
  | "geburtsort"
  | "phone"
  | "festnetz";

export const MASTER_FIELD_LABELS: Record<ParticipantMasterField, string> = {
  vorname: "Vorname",
  nachname: "Nachname",
  strasse: "Straße / Hausnummer",
  plz: "PLZ",
  ort: "Ort",
  geburtsort: "Geburtsort",
  phone: "Mobilfunknummer",
  festnetz: "Festnetznummer",
};

/** Reihenfolge der Stammdaten-Felder im Editor. */
export const MASTER_FIELD_ORDER: ParticipantMasterField[] = [
  "vorname",
  "nachname",
  "strasse",
  "plz",
  "ort",
  "geburtsort",
  "phone",
  "festnetz",
];

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
  /** Wer das Dokument verwaltet/signiert (die jeweils andere Rolle: read-only). */
  owner: DocumentOwner;
  /** Vom Coach ausgefüllte Felder (Snapshot in `documents.form_data`). */
  fields: DocField[];
  /** Für dieses Dokument verpflichtende Teilnehmer-Stammdaten. */
  requiredMasterData: ParticipantMasterField[];
  /**
   * Wer unterschreibt. Der Teilnehmer signiert immer. `coach: true` = zusätzlich
   * unterschreibt die erango-Seite ZUERST (Freigabe = erango-Signatur, dann
   * Teilnehmer). Aktuell bei ALLEN Varianten true — die erango-Formulare tragen
   * alle eine zweite Unterschrift. Die QUELLE dieser Signatur hängt am `owner`:
   * bei `coach` die persönliche Coach-Unterschrift (`users.signature_url`), bei
   * `bildungstraeger` die geteilte Org-Unterschrift (`tenants.signature_url`).
   * Der ANGEZEIGTE Titel unterscheidet sich je Formular (STV: „Coach";
   * DS/TNV/Merge: „erango Mitarbeiter:in") und steckt in der jeweiligen
   * Template-Komponente, nicht hier.
   */
  signers: { coach: boolean };
};

const F04: DocumentConfig = {
  id: "f04_ds",
  formNumber: "F 04",
  label: "Datenschutzerklärung",
  fullTitle: "Datenschutzerklärung",
  description:
    "Datenschutzhinweise nach Art. 13/14 DSGVO für Teilnehmer:innen von AVGS-Einzelcoachings.",
  owner: "bildungstraeger",
  fields: [
    {
      key: "ort",
      label: "Ort (für die Unterschriftszeile)",
      type: "text",
      placeholder: "z.B. Singen",
    },
  ],
  requiredMasterData: [],
  signers: { coach: true },
};

// Maßnahme-/Vertragsfelder der TNV — auch vom Merge genutzt.
const TNV_FIELDS: DocField[] = [
  {
    key: "massnahme",
    label: "Maßnahme",
    type: "text",
    required: true,
    placeholder: "z.B. Karrierecoaching (EKC)",
  },
  { key: "ort", label: "Ort (Durchführung)", type: "text", required: true },
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
  // Beginn/Ende sind oft noch nicht bekannt → nicht verpflichtend.
  { key: "beginn", label: "Beginn", type: "date" },
  { key: "voraussEnde", label: "vorauss. Ende", type: "date" },
];

const F08: DocumentConfig = {
  id: "f08_tnv",
  formNumber: "F 08",
  label: "Teilnehmervertrag",
  fullTitle: "Teilnehmervertrag / Anmeldung I AVGS",
  description:
    "Verbindliche Anmeldung zur AVGS-Maßnahme inkl. Stamm- und Maßnahmedaten.",
  owner: "bildungstraeger",
  fields: TNV_FIELDS,
  // Reduziert auf das, was erango realistisch immer hat.
  requiredMasterData: ["vorname", "nachname"],
  signers: { coach: true },
};

const F21: DocumentConfig = {
  id: "f21_stv",
  formNumber: "F 21",
  label: "Strategievereinbarung",
  fullTitle: "Strategievereinbarung",
  description:
    "Individuelle Ziel- und Arbeitsvereinbarung zwischen Teilnehmer:in und Coach.",
  owner: "coach",
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
      placeholder: "z.B. Singen",
    },
  ],
  requiredMasterData: [],
  // Einzige Variante mit Coach-Unterschrift.
  signers: { coach: true },
};

const TNV_DS_MERGE: DocumentConfig = {
  id: "tnv_ds_merge",
  formNumber: "F 08 + F 04",
  label: "Teilnehmervertrag + Datenschutz",
  fullTitle: "Teilnehmervertrag / Anmeldung I AVGS + Datenschutzerklärung",
  description:
    "Kombiniertes Dokument: Teilnehmervertrag und Datenschutzerklärung in einem, eine Unterschrift.",
  owner: "bildungstraeger",
  fields: TNV_FIELDS,
  requiredMasterData: ["vorname", "nachname"],
  signers: { coach: true },
};

const CONFIGS: Record<DocumentTypeId, DocumentConfig> = {
  f04_ds: F04,
  f08_tnv: F08,
  f21_stv: F21,
  tnv_ds_merge: TNV_DS_MERGE,
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

/**
 * Konfigurationen, die die angegebene Rolle verwaltet (anlegen/ausfüllen/
 * signieren) — in fester Reihenfolge. Für die Anlegen-Auswahl der jeweiligen
 * Seite (Coach: nur STV; Bildungsträger: DS/TNV/Merge).
 */
export function documentConfigsForOwner(owner: DocumentOwner): DocumentConfig[] {
  return allDocumentConfigs().filter((c) => c.owner === owner);
}

/** Ob die angegebene Rolle diesen Dokumenttyp verwalten (nicht nur ansehen) darf. */
export function isDocumentOwnedBy(
  type: DocumentTypeId,
  owner: DocumentOwner,
): boolean {
  return CONFIGS[type].owner === owner;
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

function tnvPrefill(input: PrefillInput): Record<string, string> {
  return {
    massnahme: input.massnahmeLabel,
    ort: input.durchfuehrungsort || "",
    anzahlUe: input.anzahlBewilligteUe ? String(input.anzahlBewilligteUe) : "",
    ueProWoche: "min. 2 Termine/Woche",
    beginn: input.startDate ?? "",
    voraussEnde: input.endDate ?? "",
  };
}

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
    case "tnv_ds_merge":
      return tnvPrefill(input);
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
 * vollständig). Wird beim Freigeben/Signieren als harte Hürde ausgewertet.
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

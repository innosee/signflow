/**
 * Inhalte-Kataloge für die Teilnahmebescheinigung (erango F 05-x).
 *
 * Der Coach kreuzt aus dem maßnahmentyp-spezifischen Katalog an, was mit der/dem
 * Teilnehmer:in bearbeitet wurde. Die Auswahl wird zur Inhalte-Liste auf der
 * generierten Teilnahmebescheinigung.
 *
 * Bewusst **rein** (keine DB-/server-only-Imports) — Client-Editor und
 * Server-Action/Template teilen dieselben Definitionen. Quelle: erango-Formulare
 * F 05-1 (EGC), F 05-2 (EKC), F 05-3 (ESC), F 05-5 (ESCA), Rev. 25.06.2025.
 */

import type { MassnahmeTypCode } from "@/lib/massnahme-typ";

export type TnbKatalogItem = {
  /** Stabiler Schlüssel (in documents.form_data gespeichert). */
  key: string;
  label: string;
};

export type TnbKatalogGruppe = {
  /** Optionaler Gruppentitel (nur EGC: Hauptthemen / Zusatzthemen). */
  title?: string;
  items: TnbKatalogItem[];
};

export type TnbKatalog = {
  /** Mindestanzahl anzukreuzender Punkte (inkl. eigener Zeilen). */
  min: number;
  /** Höchstanzahl anzukreuzender Punkte (inkl. eigener Zeilen). */
  max: number;
  /** Hinweistext wie auf dem Papierformular. */
  hint: string;
  groups: TnbKatalogGruppe[];
};

/** Titel der Maßnahme auf der Teilnahmebescheinigung (erango-Vorlagen). */
export const TNB_MASSNAHME_TITEL: Record<MassnahmeTypCode, string> = {
  EKC: "erango systemisches Karrierecoaching (EKC)",
  ESC: "erango systemisches Coaching (ESC)",
  EGC: "erango systemisches Gründungscoaching (EGC)",
  ESCA: "erango systemische Stabilisierung während der Probezeit (ESCA)",
};

const EKC_ITEMS = [
  "Berufliche Zielklärung & individuelle Karriereplanung",
  "Selbstreflexion, Potenzialentwicklung & Profiling",
  "Berufsorientierung & Entscheidungsfindung",
  "Entwicklung & Umsetzung einer Karrierestrategie",
  "Erweiterung von Handlungskompetenz & Selbstwirksamkeit",
  "Bewerbungstraining & Optimierung der Unterlagen",
  "Vorbereitung auf Vorstellungsgespräche & Assessment Center",
  "Selbstmarketing, Netzwerkaufbau & Nutzung beruflicher Netzwerke",
  "Aufdeckung & Bearbeitung dysfunktionaler Überzeugungen (inkl. Reframing)",
  "Strategien für den verdeckten Arbeitsmarkt",
  "Nutzung digitaler Tools & Medienkompetenz",
  "Work-Life-Design, Balance & berufliche Neu-/Umorientierung",
  "Persönlichkeitsentwicklung & Kommunikationskompetenz",
  "Resilienzförderung, Burnout-/Boreout-Prävention & psychische Stabilisierung",
  "Transfer in den beruflichen Alltag & Begleitung bis zur Integration",
];

const ESC_ITEMS = [
  "Ressourcenaktivierung & Selbstreflexion",
  "Zielfindung, Zielklärung & Strategieentwicklung",
  "Konfliktbewältigung & Reframing von Blockaden",
  "Entscheidungsfindung im systemischen Kontext",
  "Veränderungsmanagement & Umgang mit Widerständen",
  "Kommunikationsförderung & -optimierung",
  "Analyse der sozialen Situation (Familie, Gesundheit, Finanzen etc.)",
  "Standortbestimmung & Profiling",
  "Motivationsanalyse & individuelle Themenbearbeitung",
  "Bewerbungsunterlagen erstellen / optimieren",
  "Aktivierung auf dem offenen & verdeckten Arbeitsmarkt",
  "Perspektivenentwicklung & Um-/Neuorientierung",
  "Bearbeitung von Vermittlungshemmnissen & dysfunktionalen Überzeugungen",
  "Work-Life-Design & Zukunftsplanung",
  "Coachingstruktur: Klärung der Ausgangslage, Reiseroute, Umsetzung & Feedback",
];

const EGC_HAUPTTHEMEN = [
  "Gründerpersönlichkeit",
  "Businessplan",
  "Finanzierung",
  "Tragfähigkeitsanalyse",
  "Stärken und Schwächen; Chancen und Risiken",
  "Strategien für Angebote, Preise, Vertrieb und Werbung",
  "Markt, Branche, Mitbewerber",
  "Marketing, Kundengewinnung und Standortfragen",
  "Netzwerke, Internet",
  "Fördermöglichkeiten",
];

const EGC_ZUSATZTHEMEN = [
  "Persönliche und fachliche Anforderungen an Gründer",
  "Umsatzplanung",
  "Personal",
  "Formalitäten",
  "Branchenanalyse",
  "Potentialanalyse der Zielgruppe des Marktes",
  "Festlegung von Unternehmenszielen",
  "Aufbau von Strategien für das Unternehmen",
  "Überprüfung der Markt- & Wettbewerbssituation",
  "Kommunikations- & Vertriebspolitik",
  "Finanzierungsformen",
  "Fördermittel",
  "Branchenspezifische Vorbereitungsmaßnahmen",
];

const ESCA_ITEMS = [
  "Klärung beruflicher und privater Ziele",
  "Bewältigung von Hemmnissen und Blockaden",
  "Selbstreflexion und Potenzialentwicklung",
  "Steigerung der Leistungsfähigkeit",
  "individuelle Strategieentwicklung",
  "Umgang mit Krisen, Konfliktarbeit",
  "Resilienz, Achtsamkeit, Burn-Out Prävention",
  "Erarbeitung von Handlungsperspektiven",
  "Stärken- und Schwächenanalyse",
  "Stabilisierung des neuen Arbeitsverhältnisses",
  "Problemfindung und Wege für die Problemlösung",
  "Krisenintervention und Kommunikationstraining",
  "Aufdeckung und Überarbeitung dysfunktionaler Überzeugungen",
  "Refraiming für die Blockadenauflösung",
  "Work-Life-Balance",
  "Vor- und Nachbereitung von Personalgesprächen",
  "Nutzung beruflicher, persönlicher und Online-Netzwerke",
  "Strategien für einen optimalen Auftritt im Unternehmen",
];

function toItems(prefix: string, labels: string[]): TnbKatalogItem[] {
  return labels.map((label, i) => ({
    key: `${prefix}-${String(i + 1).padStart(2, "0")}`,
    label,
  }));
}

export const TNB_KATALOGE: Record<MassnahmeTypCode, TnbKatalog> = {
  EKC: {
    min: 3,
    max: 7,
    hint: "mind. 3, aber max. 7 ankreuzen",
    groups: [{ items: toItems("ekc", EKC_ITEMS) }],
  },
  ESC: {
    min: 3,
    max: 7,
    hint: "mind. 3, aber max. 7 ankreuzen",
    groups: [{ items: toItems("esc", ESC_ITEMS) }],
  },
  EGC: {
    min: 1,
    max: 7,
    hint: "insgesamt max. 7 Punkte ankreuzen",
    groups: [
      { title: "Hauptthemen", items: toItems("egc-h", EGC_HAUPTTHEMEN) },
      {
        title: "Falls gewünscht spezielle Zusatzthemen",
        items: toItems("egc-z", EGC_ZUSATZTHEMEN),
      },
    ],
  },
  ESCA: {
    min: 1,
    max: 7,
    hint: "insgesamt max. 7 Punkte ankreuzen",
    groups: [{ items: toItems("esca", ESCA_ITEMS) }],
  },
};

/** Anzahl eigener Freitext-Zeilen, die der Coach ergänzen kann. */
export const TNB_CUSTOM_LINES = 3;

/** Flache Key→Label-Map eines Katalogs (fürs Rendern der Bescheinigung). */
export function tnbLabelForKey(
  typ: MassnahmeTypCode,
  key: string,
): string | null {
  for (const g of TNB_KATALOGE[typ].groups) {
    const hit = g.items.find((it) => it.key === key);
    if (hit) return hit.label;
  }
  return null;
}

/**
 * Baut die finale Inhalte-Liste (Katalog-Labels der gewählten Keys, in
 * Katalog-Reihenfolge, gefolgt von nicht-leeren eigenen Zeilen).
 */
export function tnbInhalteListe(
  typ: MassnahmeTypCode,
  selectedKeys: string[],
  customLines: string[],
): string[] {
  const sel = new Set(selectedKeys);
  const fromKatalog: string[] = [];
  for (const g of TNB_KATALOGE[typ].groups) {
    for (const it of g.items) {
      if (sel.has(it.key)) fromKatalog.push(it.label);
    }
  }
  const custom = customLines.map((l) => l.trim()).filter(Boolean);
  return [...fromKatalog, ...custom];
}

export type TnbValidationInput = {
  selectedKeys: string[];
  customLines: string[];
};

/**
 * Prüft die Auswahl gegen min/max des Katalogs. Rückgabe = Fehlermeldung oder
 * null (ok). Eigene Zeilen zählen wie angekreuzte Punkte.
 */
export function validateTnbAuswahl(
  typ: MassnahmeTypCode,
  input: TnbValidationInput,
): string | null {
  const kat = TNB_KATALOGE[typ];
  const validKeys = new Set(
    kat.groups.flatMap((g) => g.items.map((it) => it.key)),
  );
  const selected = input.selectedKeys.filter((k) => validKeys.has(k));
  const custom = input.customLines.map((l) => l.trim()).filter(Boolean);
  const total = selected.length + custom.length;

  if (total > kat.max) {
    return `Bitte höchstens ${kat.max} Punkte auswählen (aktuell ${total}).`;
  }
  if (total < kat.min) {
    return kat.min === 1
      ? "Bitte mindestens einen Inhalt auswählen."
      : `Bitte mindestens ${kat.min} Punkte auswählen (aktuell ${total}).`;
  }
  return null;
}

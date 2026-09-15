/**
 * Standalone /tnb Mini-Konfigurator — reine Logik (KEINE DB-/server-only-Imports).
 *
 * Die öffentliche, login-freie /tnb-Seite erzeugt dieselbe erango-Teilnahme-
 * bescheinigung wie der Coach-Flow, aber für Kund:innen, die (noch) nicht in
 * Signflow angelegt sind — reine Ad-hoc-Eingabe → PDF, kein DB-Dokument.
 *
 * Diese Datei ist die geteilte Vertrags-Schicht zwischen dem Client-Formular
 * (baut die PDF-URL), der Print-Seite (liest die Query) und der PDF-Route.
 * `buildTnbSheetData` mappt die Eingaben auf das bestehende `DocumentSheetData`,
 * sodass die vorhandene Template-Komponente unverändert (pixel-identisch)
 * wiederverwendet wird.
 */

import type { MassnahmeTypCode } from "@/lib/massnahme-typ";
import { isMassnahmeTyp, MASSNAHME_TYP_LABEL } from "@/lib/massnahme-typ";
import { TNB_MASSNAHME_TITEL } from "@/lib/documents/tnb-katalog";
import type { DocumentSheetData } from "@/components/documents/types";

export type TnbAnrede = "herr" | "frau";

export const TNB_ANREDE_LABEL: Record<TnbAnrede, string> = {
  herr: "Herr",
  frau: "Frau",
};

export function isTnbAnrede(v: string): v is TnbAnrede {
  return v === "herr" || v === "frau";
}

/** Roh-Eingaben des Konfigurators (alles Strings, wie aus dem Formular/Query). */
export type TnbPublicInput = {
  anrede: TnbAnrede;
  vorname: string;
  nachname: string;
  /** ISO-Datum (yyyy-mm-dd) oder "". */
  von: string;
  bis: string;
  massnahmeTyp: MassnahmeTypCode;
  /** Anzahl UE als Freitext (z.B. "80"). */
  ue: string;
  ort: string;
  /** Angekreuzte Katalog-Keys (z.B. "ekc-01"). */
  selectedKeys: string[];
  /** Eigene Freitext-Zeilen (leere werden verworfen). */
  customLines: string[];
};

export const TNB_DEFAULT_TYP: MassnahmeTypCode = "EKC";

export function emptyTnbInput(): TnbPublicInput {
  return {
    anrede: "herr",
    vorname: "",
    nachname: "",
    von: "",
    bis: "",
    massnahmeTyp: TNB_DEFAULT_TYP,
    ue: "",
    ort: "",
    selectedKeys: [],
    customLines: [],
  };
}

/** Voller Name inkl. Anrede für die Bescheinigungs-Zeile („Herr Max Muster"). */
export function tnbFullName(input: TnbPublicInput): string {
  const parts = [
    TNB_ANREDE_LABEL[input.anrede],
    input.vorname.trim(),
    input.nachname.trim(),
  ].filter(Boolean);
  return parts.join(" ").trim();
}

// --- Query-(De)Serialisierung ---------------------------------------------
// URLSearchParams als Transport zwischen Client-Formular → PDF-Route →
// Print-Seite. Custom-Zeilen als wiederholtes `custom`-Param (kein Delimiter-
// Escaping nötig).

export function encodeTnbParams(input: TnbPublicInput): URLSearchParams {
  const p = new URLSearchParams();
  p.set("anrede", input.anrede);
  p.set("vorname", input.vorname);
  p.set("nachname", input.nachname);
  p.set("von", input.von);
  p.set("bis", input.bis);
  p.set("typ", input.massnahmeTyp);
  p.set("ue", input.ue);
  p.set("ort", input.ort);
  for (const k of input.selectedKeys) p.append("key", k);
  for (const c of input.customLines) {
    if (c.trim()) p.append("custom", c);
  }
  return p;
}

/** Query-Param-Bag (Next `searchParams`) → normalisierte Eingaben. */
export function decodeTnbParams(
  sp: Record<string, string | string[] | undefined>,
): TnbPublicInput {
  const one = (v: string | string[] | undefined): string =>
    (Array.isArray(v) ? v[0] : v) ?? "";
  const many = (v: string | string[] | undefined): string[] =>
    Array.isArray(v) ? v : v != null ? [v] : [];

  const anredeRaw = one(sp.anrede);
  const typRaw = one(sp.typ);

  return {
    anrede: isTnbAnrede(anredeRaw) ? anredeRaw : "herr",
    vorname: one(sp.vorname),
    nachname: one(sp.nachname),
    von: one(sp.von),
    bis: one(sp.bis),
    massnahmeTyp: isMassnahmeTyp(typRaw) ? typRaw : TNB_DEFAULT_TYP,
    ue: one(sp.ue),
    ort: one(sp.ort),
    selectedKeys: many(sp.key),
    customLines: many(sp.custom),
  };
}

// --- Mapping auf DocumentSheetData ----------------------------------------

export type TnbAssets = {
  logoUrl: string | null;
  orgSignatureUrl: string | null;
};

/**
 * Baut aus den Konfigurator-Eingaben ein `DocumentSheetData`, das die
 * bestehende `TnbTeilnahmebescheinigung`-Komponente direkt rendert. Alle
 * Zeitraum/UE/Ort-Werte gehen als eingefrorener `cert_*`-Snapshot rein
 * (Vorrang vor den Kurs-Fallbacks im Template). `ausstellungsdatum` bleibt
 * bewusst leer → das Template setzt „heute" (Europe/Berlin) beim Render.
 */
export function buildTnbSheetData(
  input: TnbPublicInput,
  assets: TnbAssets,
): DocumentSheetData {
  const typ = input.massnahmeTyp;
  const massnahmeTitel = TNB_MASSNAHME_TITEL[typ];

  return {
    documentId: "tnb-public",
    type: "tnb_cert",
    status: "completed",
    formData: {
      cert_von: input.von,
      cert_bis: input.bis,
      cert_ue: input.ue,
      cert_ort: input.ort,
      selectedKeys: JSON.stringify(input.selectedKeys),
      customLines: JSON.stringify(
        input.customLines.map((l) => l.trim()).filter(Boolean),
      ),
    },
    branding: { logoUrl: assets.logoUrl },
    orgSignatureUrl: assets.orgSignatureUrl,
    participant: {
      name: tnbFullName(input),
      vorname: input.vorname || null,
      nachname: input.nachname || null,
      strasse: null,
      plz: null,
      ort: null,
      geburtsdatum: null,
      geburtsort: null,
      phone: null,
      festnetz: null,
      email: "",
      kundenNr: "",
    },
    course: {
      title: massnahmeTitel,
      massnahmeTyp: typ,
      massnahmeLabel: MASSNAHME_TYP_LABEL[typ],
      durchfuehrungsort: input.ort,
      avgsNummer: "",
      anzahlBewilligteUe: 0,
      geleisteteUe: null,
      startDate: input.von || null,
      endDate: input.bis || null,
      letzterTermin: input.bis || null,
    },
    coachName: "",
    signatures: { coach: null, participant: null },
  };
}

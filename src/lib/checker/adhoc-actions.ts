"use server";

import { revalidatePath } from "next/cache";

import { db, schema } from "@/db";
import { isImpersonating, requireCoach } from "@/lib/dal";
import { type CheckerInput, type CheckerResult } from "@/lib/checker/types";

export type AdhocBerInput = {
  tnVorname: string;
  tnNachname: string;
  tnKundenNr: string;
  tnAvgsNummer: string;
  tnZeitraum: string;
  tnUe: string;
  /** Markierung für PDF-Header. */
  keineFehlzeiten: boolean;
  /**
   * Optionales Freitext-Feld für AVGS-Inhalte (GEPEDU-Test, Anerkennung
   * ausländischer Diplome, …). Kein Checker-Pass darüber.
   */
  sonstiges: string;
  /**
   * Fehlalarm-Begründung des Coaches für eine als sensibel markierte Stelle
   * (hard_block). Nur ein nicht überschriebener hard_block blockiert das
   * Einreichen; mit Begründung (≥10 Zeichen) ist der Submit frei. Spaltenname
   * historisch („mustHave…"), Semantik ist heute der Hard-Block-Override.
   */
  mustHaveOverrideReason: string | null;
  input: CheckerInput;
  result: CheckerResult;
};

export type AdhocBerSubmitResult =
  | { ok: true; berId: string }
  | { ok: false; error: string };

const OVERRIDE_REASON_MIN = 10;
const OVERRIDE_REASON_MAX = 500;
const SONSTIGES_MAX = 4000;

/**
 * Submitted einen Schnell-Check als Ad-hoc-Abschlussbericht (ohne Kurs/TN-
 * Stammdaten im System). Speichert TN-Daten denormalisiert direkt in
 * abschlussberichte. Coach muss eingeloggt sein, Impersonation ist hart
 * geblockt — sonst wäre die Beweiskraft der Check-Bestätigung gebrochen.
 */
export async function submitAdhocBerAction(
  data: AdhocBerInput,
): Promise<AdhocBerSubmitResult> {
  const session = await requireCoach();
  if (isImpersonating(session)) {
    return {
      ok: false,
      error:
        "Im Impersonation-Modus deaktiviert — Bildungsträger kann keine Berichte einreichen.",
    };
  }

  // Submit-Gate (identisch zum Kurs-Editor, Zwei-Kategorien-Modell):
  //   * EINZIGE harte Hürde ist ein nicht überschriebener hard_block
  //     (Art-9/Gesundheit, harte Ablehnungs-Prognose). Der Coach muss die
  //     Stelle entfernen ODER einen Fehlalarm begründen (≥10 Zeichen).
  //   * soft_flags + fehlende Pflichtbausteine sind rein beratend und
  //     blockieren das Einreichen NIE.
  const overrideReason = (data.mustHaveOverrideReason ?? "").trim();
  const overrideActive = overrideReason.length > 0;
  const hasHardBlock = data.result.violations.some(
    (v) => v.severity === "hard_block",
  );

  if (hasHardBlock && !overrideActive) {
    return {
      ok: false,
      error:
        "Der Bericht enthält eine als sensibel markierte Stelle (z.B. Gesundheitsangabe oder harte negative Prognose). Bitte entferne die Stelle — oder begründe unten einen Fehlalarm (mind. 10 Zeichen).",
    };
  }

  if (overrideActive) {
    if (overrideReason.length < OVERRIDE_REASON_MIN) {
      return {
        ok: false,
        error: `Begründung für Override muss mindestens ${OVERRIDE_REASON_MIN} Zeichen haben.`,
      };
    }
    if (overrideReason.length > OVERRIDE_REASON_MAX) {
      return {
        ok: false,
        error: `Begründung für Override darf max. ${OVERRIDE_REASON_MAX} Zeichen haben.`,
      };
    }
  }

  const sonstigesTrimmed = data.sonstiges.trim();
  if (sonstigesTrimmed.length > SONSTIGES_MAX) {
    return {
      ok: false,
      error: `Sonstiges-Feld darf max. ${SONSTIGES_MAX} Zeichen haben.`,
    };
  }

  const tnVorname = data.tnVorname.trim();
  const tnNachname = data.tnNachname.trim();
  if (tnVorname.length === 0 || tnNachname.length === 0) {
    return {
      ok: false,
      error: "Vor- und Nachname des Teilnehmers sind Pflicht.",
    };
  }

  // Mindestens ein Abschnitt muss Inhalt haben — gilt auch mit Override.
  // Sonst entstünde ein leerer Bericht.
  if (
    !data.input.teilnahme.trim() &&
    !data.input.ablauf.trim() &&
    !data.input.fazit.trim()
  ) {
    return {
      ok: false,
      error:
        "Mindestens ein Abschnitt muss Inhalt haben — sonst gibt es nichts einzureichen.",
    };
  }

  let row: { id: string };
  try {
    [row] = await db
      .insert(schema.abschlussberichte)
      .values({
        courseId: null,
        participantId: null,
        coachId: session.user.id,
        teilnahme: data.input.teilnahme,
        ablauf: data.input.ablauf,
        fazit: data.input.fazit,
        sonstiges: sonstigesTrimmed,
        keineFehlzeiten: data.keineFehlzeiten,
        mustHaveOverrideReason: overrideActive ? overrideReason : null,
        tnVorname,
        tnNachname,
        tnKundenNr: data.tnKundenNr.trim(),
        tnAvgsNummer: data.tnAvgsNummer.trim(),
        tnZeitraum: data.tnZeitraum.trim(),
        tnUe: data.tnUe.trim(),
        coachNameSnapshot: session.user.name,
        status: "submitted",
        // `lastCheckPassed` bleibt true auch beim Override — die DB-
        // Submit-Invariante verlangt das. Die Tatsache, dass Bausteine
        // gefehlt haben, steht im `checkSnapshot` + `mustHaveOverrideReason`.
        lastCheckPassed: true,
        checkSnapshot: { v: 2, input: data.input, result: data.result },
        submittedAt: new Date(),
      })
      .returning({ id: schema.abschlussberichte.id });
  } catch (err) {
    // Sichtbare Server-Logs für DB-Constraint-Violations o.ä. Vorher war der
    // Fehler nur als generischer 500 sichtbar; der Coach klickte „Einreichen"
    // und der Bericht verschwand stumm. Der Stack-Trace im console.error
    // hilft beim Diagnostizieren (Constraint-Name, fehlende Spalte, …).
    console.error("submitAdhocBerAction insert failed:", err);
    return {
      ok: false,
      error: `DB-Insert fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Bildungsträger-Liste invalidieren, damit der neue Bericht sofort
  // erscheint, ohne dass die Seite hart neu geladen werden muss.
  revalidatePath("/bildungstraeger/abschlussberichte");
  revalidatePath("/bildungstraeger");
  // Coach-Checker-Dashboard zeigt den Bericht in der eingereicht-Liste.
  revalidatePath("/coach/checker");

  return { ok: true, berId: row.id };
}

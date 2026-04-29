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
   * Begründung des Coaches, wenn nicht alle Pflicht-Bausteine in dieser
   * Maßnahme abdeckbar sind. Wenn null/leer → strict-Pass nötig. Wenn
   * gesetzt → fehlende mustHaves werden zu Soft-Flag-Override (kein Hard-
   * Block-Bypass — wenn auch echte Verstöße vorhanden sind, blockt das
   * weiterhin).
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

  // Submit-Gate:
  //   * status === "pass"                                    → immer OK
  //   * status === "needs_revision" UND nur fehlende mustHaves
  //     UND mustHaveOverrideReason gesetzt                   → OK (Soft-Override)
  //   * sonst → blockiert (echte Verstöße müssen abgearbeitet werden)
  const overrideReason = (data.mustHaveOverrideReason ?? "").trim();
  const overrideActive = overrideReason.length > 0;

  if (data.result.status !== "pass") {
    if (!overrideActive) {
      return {
        ok: false,
        error:
          "Nur bestandene Berichte können eingereicht werden. Bitte zuerst die Verstöße in der Sidebar abarbeiten.",
      };
    }
    const hasHardBlock = data.result.violations.some(
      (v) => v.severity === "hard_block",
    );
    if (hasHardBlock) {
      return {
        ok: false,
        error:
          "Es bestehen noch Hard-Block-Verstöße. Override gilt nur für fehlende Pflicht-Bausteine, nicht für inhaltliche Regelverstöße.",
      };
    }
    const hasMissingMustHaves = data.result.mustHaves.some((m) => !m.covered);
    if (!hasMissingMustHaves) {
      return {
        ok: false,
        error: "Override aktiv, aber keine fehlenden Pflicht-Bausteine — bitte erneut prüfen.",
      };
    }
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

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
  input: CheckerInput;
  result: CheckerResult;
};

export type AdhocBerSubmitResult =
  | { ok: true; berId: string }
  | { ok: false; error: string };

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

  if (data.result.status !== "pass") {
    return {
      ok: false,
      error:
        "Nur bestandene Berichte können eingereicht werden. Bitte zuerst die Verstöße in der Sidebar abarbeiten.",
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
        tnVorname,
        tnNachname,
        tnKundenNr: data.tnKundenNr.trim(),
        tnAvgsNummer: data.tnAvgsNummer.trim(),
        tnZeitraum: data.tnZeitraum.trim(),
        tnUe: data.tnUe.trim(),
        coachNameSnapshot: session.user.name,
        status: "submitted",
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

  return { ok: true, berId: row.id };
}

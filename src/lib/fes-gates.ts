import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

/**
 * Setzt die inhaltsabhängigen FES-Gates eines Kurses zurück. Single Source of
 * Truth dafür, was eine Termin-/Inhalts-Änderung am Kurs invalidiert — sonst
 * driften die (bisher 4×) kopierten Reset-Blöcke auseinander, sobald ein neues
 * Gate dazukommt.
 *
 * Immer zurückgesetzt:
 *   - `anwCheckPassedAt`  (ANW-Compliance-Check, FES-Gate 2)
 *   - die Bildungsträger-Prüfung (FES-Gate 3): `reviewStatus` → 'none' plus die
 *     drei Review-Zeitstempel/Entscheider-Felder.
 *   - die Analog-Scan-Bestätigung (`analogScanUrl`/`analogConfirmedAt`/
 *     `analogConfirmedBy`): der bestätigte Papier-Scan bezeugt einen konkreten
 *     Inhalts-Stand; ändert sich der Inhalt, muss neu unterschrieben + neu
 *     hochgeladen werden. No-op für digitale Kurse (Felder sind dort ohnehin
 *     NULL). Das alte Scan-Objekt im Storage wird bewusst NICHT gelöscht
 *     (best-effort-Cleanup wäre möglich, orphan ist harmlos).
 *
 * `abgeschlossenAt` (FES-Gate 1) wird nur bei `keepAbgeschlossen: false`
 * (Default) genullt. Bei reinen Inhalts-Korrekturen am Themen-Text
 * (`correctSessionTopic`) bleibt der Maßnahme-Abschluss bestehen — die
 * Anwesenheits-Tatsache ändert sich dadurch nicht.
 *
 * Hinweis: Das Verwerfen der TN-Freigaben (`participant_approvals`) und das
 * Löschen von Signaturen sind NICHT Teil dieses Helpers — sie sind nur in
 * einem Teil der Aufrufer nötig (neuer Termin / Reopen) und bleiben dort
 * explizit.
 */
export async function resetFesGates(
  executor: DbOrTx,
  courseId: string,
  opts: { keepAbgeschlossen?: boolean } = {},
): Promise<void> {
  await executor
    .update(schema.courses)
    .set({
      ...(opts.keepAbgeschlossen ? {} : { abgeschlossenAt: null }),
      anwCheckPassedAt: null,
      reviewStatus: "none",
      reviewRequestedAt: null,
      reviewDecidedAt: null,
      reviewDecidedBy: null,
      analogScanUrl: null,
      analogConfirmedAt: null,
      analogConfirmedBy: null,
    })
    .where(eq(schema.courses.id, courseId));
}

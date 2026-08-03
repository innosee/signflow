import "server-only";

import { and, inArray, lt, not, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import type { AuditAction } from "@/lib/audit";

/**
 * Automatisierte Löschroutinen (DSGVO Art. 5 Abs. 1 lit. e — Speicherbegrenzung).
 * Behebt Datenschutz-Audit-Befund P1-3: abgelaufene Magic-Link-Token und
 * Audit-Log-Einträge wuchsen bisher unbegrenzt.
 *
 * Aufgerufen vom Vercel-Cron über `app/api/cron/cleanup/route.ts` (täglich).
 * Die Fristen hier sind die Source of Truth und müssen mit der
 * Datenschutzerklärung §7 (`app/(legal)/datenschutz/page.tsx`) übereinstimmen.
 */

/**
 * Abgelaufene Token-Datensätze bleiben nach `expires_at` noch 30 Tage als
 * Zugriffs-Nachweis liegen (Support: "warum ging mein Link nicht?"), danach
 * werden die Zeilen gelöscht. Der Klartext-Token war ohnehin nie gespeichert
 * (nur SHA-256-Hash), gelöscht wird also der Rest-Metadatensatz
 * (Kurs × Teilnehmer × Ausstellungs-/Ablaufzeit).
 */
export const TOKEN_RETENTION_DAYS_AFTER_EXPIRY = 30;

/** Aufbewahrungsfrist für nicht-signaturbezogene Audit-Log-Einträge. */
export const AUDIT_LOG_RETENTION_MONTHS = 12;

/**
 * Abgrenzung: signaturbezogen vs. löschbar.
 *
 * **Signaturbezogen** ist jede Action, die Teil der Beweiskette des signierten
 * Anwesenheitsnachweises ist — sie belegt, wer das Dokument freigegeben,
 * geprüft, abgeschlossen, übermittelt oder nachträglich verändert hat. Diese
 * Einträge werden wie der Nachweis selbst aufbewahrt (maßnahmen-/steuerrechtliche
 * Aufbewahrungspflicht, i.d.R. bis zu 10 Jahre) und vom Cleanup NIE gelöscht.
 * (Die Signaturen selbst — Coach/Teilnehmer je Termin — liegen nicht im
 * Audit-Log, sondern in `signatures` und sind hiervon ohnehin unberührt.)
 *
 * Alles andere (Impersonation-Protokoll, Checker/BER-Nutzung, Nutzer- und
 * Tenant-Verwaltung, Bewilligungs-Metadaten) ist operatives Protokoll und wird
 * nach 12 Monaten gelöscht.
 *
 * Bewusst als **Allowlist der aufzubewahrenden Actions** modelliert: eine neue
 * oder historische Action, die hier nicht gelistet ist, fällt automatisch in
 * die 12-Monats-Löschung (datenschutzfreundlicher Default). Beim Ergänzen
 * einer neuen `AuditAction` in `src/lib/audit.ts` zwingt der
 * Vollständigkeitscheck unten zur bewussten Einsortierung.
 */
export const SIGNATURE_RELATED_AUDIT_ACTIONS = [
  // Finale Freigabe des Teilnehmers für das Enddokument
  "participant.approve",
  // Abschluss des Nachweises (Bridge-Modus: BT-Freigabe; später FES-Siegel)
  "course.seal",
  // Übermittlung des signierten PDFs an die Agentur für Arbeit
  "course.submit_afa",
  // Bildungsträger-Prüfung = Abschluss-Gate 3, Teil der Freigabekette
  "course.review_requested",
  "course.review_approved",
  "course.review_changes_requested",
  // Quittierung von ANW-Hinweisen vor der Freigabe ("trotzdem freigeben")
  "anw.soft_flags.acknowledged",
  // Nachträgliche Änderungen an (ggf. signierten) Terminen bzw. der Maßnahme —
  // belegen, was sich nach Signaturleistung noch geändert hat
  "session.topic_corrected",
  "session.deleted",
  "course.delete",
  // Kunde-Dokumente (DS/TNV/STV): die Signaturen sowie Freigabe/Löschung des
  // signierbaren Dokuments gehören zur Signatur-/Nachweiskette und werden
  // aufbewahrt — analog zu session.deleted / course.delete. Reine Draft-Anlage
  // (document.created) ist operativ und fällt in die 12-Monats-Löschung unten.
  "document.released",
  "document.coach_signed",
  "document.participant_signed",
  // Zurücknahme der erango-Signatur zur Korrektur vor der Kundenunterschrift —
  // belegt (wie session.topic_corrected), was sich nach Signaturleistung noch
  // geändert hat.
  "document.reopened",
  "document.deleted",
  // Ausstellung einer Teilnahmebescheinigung (mit erango-Org-Signatur) —
  // Nachweiskette, wird aufbewahrt.
  "document.tnb_issued",
] as const satisfies readonly AuditAction[];

/**
 * Nicht-signaturbezogene Actions — nach {@link AUDIT_LOG_RETENTION_MONTHS}
 * Monaten löschbar. Nur für den Vollständigkeitscheck unten gepflegt; die
 * Lösch-Query arbeitet mit `NOT IN (SIGNATURE_RELATED_AUDIT_ACTIONS)`.
 */
export const DELETABLE_AUDIT_ACTIONS = [
  "impersonation.start",
  "impersonation.end",
  "checker.report_submitted",
  "ber.draft_saved",
  "ber.submitted",
  "ber.edited_after_submit",
  "ber.soft_flags.acknowledged",
  "coach.delete",
  "coach.update",
  "coach.invite.resend",
  "bildungstraeger.invite",
  "bildungstraeger.deactivate",
  "bildungstraeger.onboard",
  "course.bewilligt.set",
  "course.bewilligt.unset",
  // Anlage eines Kunde-Dokument-Drafts (vor jeder Signatur) — operativ.
  "document.created",
  // Erinnerungs-Mail an den Teilnehmer (Magic-Link erneut) — operativ.
  "document.participant_reminded",
] as const satisfies readonly AuditAction[];

type ClassifiedAction =
  | (typeof SIGNATURE_RELATED_AUDIT_ACTIONS)[number]
  | (typeof DELETABLE_AUDIT_ACTIONS)[number];

// Compile-Time-Vollständigkeitscheck: schlägt fehl, sobald in audit.ts eine
// neue AuditAction ergänzt wird, die hier noch nicht einsortiert ist.
const allActionsClassified: [Exclude<AuditAction, ClassifiedAction>] extends [
  never,
]
  ? true
  : never = true;
void allActionsClassified;

export type RetentionCleanupResult = {
  deletedTokens: number;
  deletedAuditLogEntries: number;
};

/**
 * Löscht Token-Datensätze, deren `expires_at` länger als
 * {@link TOKEN_RETENTION_DAYS_AFTER_EXPIRY} Tage zurückliegt.
 */
export async function cleanupExpiredParticipantTokens(
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - TOKEN_RETENTION_DAYS_AFTER_EXPIRY * 24 * 60 * 60 * 1000,
  );
  const deleted = await db
    .delete(schema.participantAccessTokens)
    .where(lt(schema.participantAccessTokens.expiresAt, cutoff))
    .returning({ id: schema.participantAccessTokens.id });
  return deleted.length;
}

/**
 * Löscht Audit-Log-Einträge, die älter als
 * {@link AUDIT_LOG_RETENTION_MONTHS} Monate UND nicht signaturbezogen sind
 * (Abgrenzung siehe {@link SIGNATURE_RELATED_AUDIT_ACTIONS}).
 */
export async function cleanupAuditLog(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - AUDIT_LOG_RETENTION_MONTHS);
  const deleted = await db
    .delete(schema.auditLog)
    .where(
      and(
        lt(schema.auditLog.createdAt, cutoff),
        not(
          inArray(schema.auditLog.action, [
            ...SIGNATURE_RELATED_AUDIT_ACTIONS,
          ]),
        ),
      ),
    )
    .returning({ id: schema.auditLog.id });
  return deleted.length;
}

/** Führt beide Löschroutinen aus. Fehler einer Routine stoppt die andere nicht. */
export async function runRetentionCleanup(): Promise<RetentionCleanupResult> {
  const [tokens, auditEntries] = await Promise.allSettled([
    cleanupExpiredParticipantTokens(),
    cleanupAuditLog(),
  ]);
  if (tokens.status === "rejected") throw tokens.reason;
  if (auditEntries.status === "rejected") throw auditEntries.reason;
  return {
    deletedTokens: tokens.value,
    deletedAuditLogEntries: auditEntries.value,
  };
}

/**
 * Rein informative Vorschau (SELECT count), keine Löschung — für manuelle
 * Verifikation auf Staging/Prod, wird von keiner Route aufgerufen.
 */
export async function previewRetentionCleanup(
  now: Date = new Date(),
): Promise<RetentionCleanupResult> {
  const tokenCutoff = new Date(
    now.getTime() - TOKEN_RETENTION_DAYS_AFTER_EXPIRY * 24 * 60 * 60 * 1000,
  );
  const auditCutoff = new Date(now);
  auditCutoff.setMonth(auditCutoff.getMonth() - AUDIT_LOG_RETENTION_MONTHS);

  const [[tokenCount], [auditCount]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.participantAccessTokens)
      .where(lt(schema.participantAccessTokens.expiresAt, tokenCutoff)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.auditLog)
      .where(
        and(
          lt(schema.auditLog.createdAt, auditCutoff),
          not(
            inArray(schema.auditLog.action, [
              ...SIGNATURE_RELATED_AUDIT_ACTIONS,
            ]),
          ),
        ),
      ),
  ]);

  return {
    deletedTokens: tokenCount?.count ?? 0,
    deletedAuditLogEntries: auditCount?.count ?? 0,
  };
}

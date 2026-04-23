import "server-only";

import { db, schema } from "@/db";

/**
 * Zentrale Schreib-Schnittstelle für das Audit-Log. Alle Aktionen, die
 * rechtlich/organisatorisch nachvollziehbar bleiben müssen, gehen hier
 * durch — nicht direkt auf `schema.auditLog.insert`, damit wir Actions
 * einheitlich buchstabieren können (siehe `AuditAction` unten).
 *
 * Akzeptiert optional eine Drizzle-Transaction, damit Audit-Einträge
 * atomar mit der eigentlichen Aktion committed werden können ("entweder
 * die TN-Freigabe ist da UND der Log-Eintrag, oder nichts davon"). Ohne
 * Transaction wird direkt auf `db` geschrieben.
 */

/**
 * Alle erlaubten Actions. Neue Aktionen hier ergänzen, damit Audit-Log-
 * Queries typ-sicher gegen String-Literale gefiltert werden können.
 */
export type AuditAction =
  | "participant.approve"
  | "course.seal"
  | "course.submit_afa"
  | "impersonation.start"
  | "impersonation.end"
  | "checker.report_submitted"
  | "ber.draft_saved"
  | "ber.submitted"
  | "ber.edited_after_submit";

export type AuditActorType =
  | "bildungstraeger"
  | "coach"
  | "participant"
  | "system";

export type AuditEntry = {
  actorType: AuditActorType;
  /** users.id oder participants.id, je nach actorType. Null bei 'system'. */
  actorId: string | null;
  /** Bildungsträger-User-ID, falls die Aktion unter Impersonation lief. */
  impersonatorId?: string | null;
  action: AuditAction;
  resourceType:
    | "course"
    | "participant"
    | "session"
    | "final_document"
    | "checker_run"
    | "abschlussbericht";
  resourceId: string;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function logAudit(
  entry: AuditEntry,
  tx?: DbOrTx,
): Promise<void> {
  const exec = tx ?? db;
  await exec.insert(schema.auditLog).values({
    actorType: entry.actorType,
    actorId: entry.actorId,
    impersonatorId: entry.impersonatorId ?? null,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    metadata: (entry.metadata ?? null) as never,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
  });
}


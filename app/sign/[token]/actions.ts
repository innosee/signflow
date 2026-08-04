"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { resolveParticipantToken } from "@/lib/participant-tokens";
import { isFutureSessionDate } from "@/lib/dates";
import { recomputeSessionStatus } from "@/lib/session-status";
import { sendDocumentSignedNotification } from "@/lib/email";
import { getDocumentConfig, type DocumentTypeId } from "@/lib/documents/config";

export type SignState = { error?: string } | undefined;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

/**
 * Signiert einen einzelnen Termin innerhalb eines aktiven Magic-Link-Tokens.
 * Token wird NICHT verbraucht — der Teilnehmer kann innerhalb der 24 h
 * weitere Termine signieren. Replay-Schutz liegt pro Termin darin, dass
 * `(session_id, participant_id, signer_type='participant')` nur einmal
 * eingefügt werden kann (wir prüfen die eindeutige Paarung vorher).
 */
export async function submitParticipantSignature(
  _prev: SignState,
  formData: FormData,
): Promise<SignState> {
  const token = String(formData.get("token") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");
  const confirmed = formData.get("confirm") === "on";

  if (!token || !sessionId) return { error: "Token oder Session fehlt." };
  if (!confirmed) return { error: "Bitte aktiv bestätigen." };

  const tokenHash = hashToken(token);
  const ipAddress =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  try {
    await db.transaction(async (tx) => {
      // Token als aktuell gültig bestätigen (NICHT konsumieren)
      const [tok] = await tx
        .select({
          courseId: schema.participantAccessTokens.courseId,
          participantId: schema.participantAccessTokens.participantId,
        })
        .from(schema.participantAccessTokens)
        .where(
          and(
            eq(schema.participantAccessTokens.tokenHash, tokenHash),
            isNull(schema.participantAccessTokens.usedAt),
            gt(schema.participantAccessTokens.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!tok) throw new Error("TOKEN_INVALID");

      // Termin muss zum Kurs des Tokens gehören
      const [sess] = await tx
        .select({
          id: schema.sessions.id,
          sessionDate: schema.sessions.sessionDate,
        })
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.id, sessionId),
            eq(schema.sessions.courseId, tok.courseId),
            isNull(schema.sessions.deletedAt),
          ),
        )
        .limit(1);
      if (!sess) throw new Error("SESSION_INVALID");
      // Zukunfts-Termine sind nicht signierbar (Termin noch nicht stattgefunden).
      if (isFutureSessionDate(sess.sessionDate)) {
        throw new Error("FUTURE_SESSION");
      }

      // 1:1: Der Token-Teilnehmer muss der Kunde genau dieses Kurses sein.
      // Eine Session-Anwesenheits-Auswahl gibt es nicht mehr — jeder Termin
      // des Kurses gehört dem einen Kunden.
      const [courseRow] = await tx
        .select({
          participantId: schema.courses.participantId,
          signatureMode: schema.courses.signatureMode,
        })
        .from(schema.courses)
        .where(eq(schema.courses.id, tok.courseId))
        .limit(1);
      if (!courseRow || courseRow.participantId !== tok.participantId) {
        throw new Error("NOT_ENROLLED");
      }
      // Analog-Modus (Papier): digitales Signieren ist gesperrt. Im Normalfall
      // wird gar kein Magic-Link verschickt; dieser Guard fängt einen alten,
      // noch gültigen Link aus einer Zeit vor der Umstellung ab.
      if (courseRow.signatureMode === "analog") {
        throw new Error("ANALOG_MODE");
      }

      // Teilnehmer muss seine Canvas-Signatur bereits einmalig angelegt
      // haben — ohne die ist die AfA-Beweiskraft nicht gegeben.
      const [part] = await tx
        .select({ signatureUrl: schema.participants.signatureUrl })
        .from(schema.participants)
        .where(eq(schema.participants.id, tok.participantId))
        .limit(1);
      const participantSignatureUrl = part?.signatureUrl ?? null;
      if (!participantSignatureUrl) throw new Error("NO_SIGNATURE");

      // Doppel-Signatur verhindern
      const existing = await tx
        .select({ id: schema.signatures.id })
        .from(schema.signatures)
        .where(
          and(
            eq(schema.signatures.sessionId, sess.id),
            eq(schema.signatures.participantId, tok.participantId),
            eq(schema.signatures.signerType, "participant"),
          ),
        )
        .limit(1);
      if (existing.length > 0) throw new Error("ALREADY_SIGNED");

      await tx.insert(schema.signatures).values({
        sessionId: sess.id,
        participantId: tok.participantId,
        signerType: "participant",
        // Snapshot der einmalig angelegten Teilnehmer-Unterschrift — siehe
        // CLAUDE.md → „Unterschriften": pro Session aktive Bestätigung
        // (Klick + Zeitstempel) + Signatur-URL als Nachweis im PDF.
        signatureUrl: participantSignatureUrl,
        ipAddress,
      });

      // Status sofort neu berechnen: wenn Coach + alle TN signiert haben,
      // springt die Session auf `completed` und zählt damit in die
      // "Geleistete UE" auf dem Kurs-Dashboard.
      await recomputeSessionStatus(sess.id, tx);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "TOKEN_INVALID") {
      return {
        error:
          "Link ist abgelaufen oder wurde durch einen neueren ersetzt. Bitte neuen Link beim Coach anfordern.",
      };
    }
    if (message === "SESSION_INVALID") {
      return { error: "Dieser Termin gehört nicht zu deinem Kurs." };
    }
    if (message === "FUTURE_SESSION") {
      return {
        error:
          "Dieser Termin liegt in der Zukunft und kann erst ab dem Termindatum bestätigt werden.",
      };
    }
    if (message === "NOT_ENROLLED") {
      return { error: "Du bist in diesem Kurs nicht eingeschrieben." };
    }
    if (message === "ANALOG_MODE") {
      return {
        error:
          "Dieser Nachweis wird auf Papier unterschrieben. Bitte wende dich an deinen Coach — hier ist keine digitale Unterschrift nötig.",
      };
    }
    if (message === "NO_SIGNATURE") {
      return {
        error:
          "Du hast noch keine Unterschrift hinterlegt. Bitte Seite neu laden und zuerst die Unterschrift anlegen.",
      };
    }
    if (message === "ALREADY_SIGNED") {
      return { error: "Dieser Termin wurde bereits bestätigt." };
    }
    throw err;
  }

  revalidatePath(`/sign/${token}`);
  return undefined;
}

export type DocSignState = { error?: string } | undefined;

/**
 * Teilnehmer unterschreibt ein vom Coach freigegebenes Kunde-Dokument
 * (Status `active`). Wie beim Termin: aktive Bestätigung + Zeitstempel + IP,
 * die einmal angelegte Unterschrift wird als Snapshot übernommen. Sobald der
 * Teilnehmer signiert, ist das Dokument abgeschlossen (Coach hat vorher
 * signiert — Voraussetzung für Status `active`).
 */
export async function submitDocumentSignature(
  _prev: DocSignState,
  formData: FormData,
): Promise<DocSignState> {
  const token = String(formData.get("token") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const confirmed = formData.get("confirm") === "on";
  if (!token || !documentId) return { error: "Token oder Dokument fehlt." };
  if (!confirmed) return { error: "Bitte aktiv bestätigen." };

  const resolved = await resolveParticipantToken(token);
  if (!resolved) {
    return { error: "Dieser Link ist abgelaufen oder ungültig." };
  }
  if (!resolved.participantSignatureUrl) {
    return { error: "Bitte lege zuerst deine Unterschrift an." };
  }
  const participantSignatureUrl: string = resolved.participantSignatureUrl;

  const h = await headers();
  const ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = h.get("user-agent");

  // Wird in der Transaktion gesetzt und NACH erfolgreichem Commit für die
  // Bildungsträger-Benachrichtigung genutzt.
  let signedDocType: DocumentTypeId | null = null;

  try {
    await db.transaction(async (tx) => {
      const [doc] = await tx
        .select({
          id: schema.documents.id,
          status: schema.documents.status,
          type: schema.documents.type,
        })
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.id, documentId),
            eq(schema.documents.courseId, resolved.courseId),
            isNull(schema.documents.deletedAt),
          ),
        )
        .limit(1);
      if (!doc) throw new Error("NOT_FOUND");
      if (doc.status !== "active") throw new Error("NOT_SIGNABLE");
      // Analog-Modus (Papier): keine digitale Dokument-Signatur. Normalerweise
      // wird kein Magic-Link verschickt; dieser Guard fängt Alt-Links ab.
      const [courseMode] = await tx
        .select({ signatureMode: schema.courses.signatureMode })
        .from(schema.courses)
        .where(eq(schema.courses.id, resolved.courseId))
        .limit(1);
      if (courseMode?.signatureMode === "analog") throw new Error("ANALOG_MODE");
      signedDocType = doc.type as DocumentTypeId;

      const [existing] = await tx
        .select({ id: schema.documentSignatures.id })
        .from(schema.documentSignatures)
        .where(
          and(
            eq(schema.documentSignatures.documentId, documentId),
            eq(schema.documentSignatures.signerType, "participant"),
          ),
        )
        .limit(1);
      if (existing) throw new Error("ALREADY_SIGNED");

      await tx.insert(schema.documentSignatures).values({
        documentId,
        signerType: "participant",
        participantId: resolved.participantId,
        signatureUrl: participantSignatureUrl,
        ipAddress,
      });

      await tx
        .update(schema.documents)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(schema.documents.id, documentId));

      await logAudit(
        {
          actorType: "participant",
          actorId: resolved.participantId,
          action: "document.participant_signed",
          resourceType: "document",
          resourceId: documentId,
          metadata: { type: doc.type },
          ipAddress,
          userAgent,
        },
        tx,
      );
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NOT_FOUND") return { error: "Dokument nicht gefunden." };
    if (message === "ANALOG_MODE") {
      return {
        error:
          "Dieses Dokument wird auf Papier unterschrieben. Bitte wende dich an deinen Coach — hier ist keine digitale Unterschrift nötig.",
      };
    }
    if (message === "NOT_SIGNABLE") {
      return {
        error:
          "Dieses Dokument ist gerade nicht zur Unterschrift bereit. Bitte lade die Seite neu.",
      };
    }
    if (message === "ALREADY_SIGNED") {
      return { error: "Du hast dieses Dokument bereits unterschrieben." };
    }
    console.error("submitDocumentSignature failed:", err);
    return { error: "Unterschrift fehlgeschlagen. Bitte erneut versuchen." };
  }

  // Best-effort: Bildungsträger-Admin(s) des Mandanten informieren, dass der
  // Teilnehmer das Dokument unterschrieben hat. Ein Fehler hier darf die
  // erfolgreiche Signatur NICHT kippen (nur loggen).
  if (signedDocType) {
    await notifyDocumentSigned({
      documentId,
      docType: signedDocType,
      courseId: resolved.courseId,
      participantId: resolved.participantId,
      participantName: resolved.participantName,
      courseTitle: resolved.courseTitle,
    });
  }

  revalidatePath(`/sign/${token}`);
  return undefined;
}

/**
 * Info-Mail „Kunde hat unterschrieben" an die verwaltenden Seiten des Dokuments
 * (wie eine To-Do-Liste zum Abarbeiten):
 *   - **Bildungsträger** (alle aktiven BT-User des Mandanten, bei erango
 *     avgs@erango.de) wird bei JEDEM Dokumenttyp informiert — er braucht das
 *     signierte Dokument immer (DS/TNV/Merge gehören ihm, die STV benötigt er
 *     ebenfalls in der Akte).
 *   - Bei der **STV** (owner=coach) zusätzlich der anlegende Coach (`created_by`).
 * Empfänger werden per E-Mail dedupliziert (Coach kann bei geteiltem Login = BT-
 * User sein → nur eine Mail). Best-effort — jede Zustellung ist gekapselt, ein
 * Fehler wird nur geloggt und stoppt weder die anderen Empfänger noch die
 * Signatur.
 */
async function notifyDocumentSigned(params: {
  documentId: string;
  docType: DocumentTypeId;
  courseId: string;
  participantId: string;
  participantName: string;
  courseTitle: string;
}): Promise<void> {
  try {
    const cfg = getDocumentConfig(params.docType);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const btUrl = `${base}/bildungstraeger/courses/${params.courseId}/dokumente`;
    const coachUrl = `${base}/coach/courses/${params.courseId}/dokumente`;

    // Empfänger sammeln, dedupliziert per E-Mail (erste Zuordnung gewinnt).
    const recipients = new Map<string, { email: string; url: string }>();

    // Bildungsträger-User des Mandanten — immer (jeder Dokumenttyp).
    const [participant] = await db
      .select({ tenantId: schema.participants.tenantId })
      .from(schema.participants)
      .where(eq(schema.participants.id, params.participantId))
      .limit(1);
    if (participant) {
      const btUsers = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.role, "bildungstraeger"),
            eq(schema.users.tenantId, participant.tenantId),
            isNull(schema.users.deletedAt),
          ),
        );
      for (const u of btUsers) {
        if (!recipients.has(u.email)) {
          recipients.set(u.email, { email: u.email, url: btUrl });
        }
      }
    }

    // Bei der STV zusätzlich der anlegende Coach.
    if (cfg.owner === "coach") {
      const [coach] = await db
        .select({ email: schema.users.email })
        .from(schema.documents)
        .innerJoin(schema.users, eq(schema.users.id, schema.documents.createdBy))
        .where(
          and(
            eq(schema.documents.id, params.documentId),
            isNull(schema.users.deletedAt),
          ),
        )
        .limit(1);
      if (coach && !recipients.has(coach.email)) {
        recipients.set(coach.email, { email: coach.email, url: coachUrl });
      }
    }

    for (const r of recipients.values()) {
      try {
        await sendDocumentSignedNotification({
          to: r.email,
          documentLabel: cfg.label,
          participantName: params.participantName,
          courseTitle: params.courseTitle,
          url: r.url,
        });
      } catch (err) {
        console.error(
          `notifyDocumentSigned: Zustellung an ${r.email} fehlgeschlagen`,
          err,
        );
      }
    }
  } catch (err) {
    console.error("notifyDocumentSigned failed:", err);
  }
}

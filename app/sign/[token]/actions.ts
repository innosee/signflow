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
import { classifyApprovalGate } from "@/lib/sign-state";
import { sendDocumentSignedToBildungstraeger } from "@/lib/email";
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
        .select({ participantId: schema.courses.participantId })
        .from(schema.courses)
        .where(eq(schema.courses.id, tok.courseId))
        .limit(1);
      if (!courseRow || courseRow.participantId !== tok.participantId) {
        throw new Error("NOT_ENROLLED");
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

export type ApproveState = { error?: string } | undefined;

/**
 * Finale Freigabe des Stundennachweises durch den Teilnehmer (CLAUDE.md
 * Schritt 8). Keine FES, rein dokumentarisch — aktive Bestätigung per
 * Klick + Zeitstempel + IP/User-Agent im Audit-Log.
 *
 * Pre-Conditions (zur Sicherheit hier nochmal geprüft, obwohl die UI
 * den Button nur im entsprechenden State zeigt):
 *   - Token gültig & nicht invalidiert
 *   - Teilnehmer ist im Kurs
 *   - ALLE nicht-gelöschten Sessions des Kurses haben die TN-Signatur
 *   - Noch keine bestehende Approval für diese (course × participant)
 */
export async function approveFinalDocument(
  _prev: ApproveState,
  formData: FormData,
): Promise<ApproveState> {
  const token = String(formData.get("token") ?? "");
  const confirmed = formData.get("confirm") === "on";

  if (!token) return { error: "Token fehlt." };
  if (!confirmed) return { error: "Bitte aktiv bestätigen." };

  const tokenHash = hashToken(token);
  const h = await headers();
  const ipAddress =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = h.get("user-agent") ?? null;

  try {
    await db.transaction(async (tx) => {
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

      // 1:1: Der Token-Teilnehmer muss der Kunde dieses Kurses sein.
      const [courseRow] = await tx
        .select({ participantId: schema.courses.participantId })
        .from(schema.courses)
        .where(eq(schema.courses.id, tok.courseId))
        .limit(1);
      if (!courseRow || courseRow.participantId !== tok.participantId) {
        throw new Error("NOT_ENROLLED");
      }

      // Preview/Freigabe ist nur gültig, wenn ALLE Sessions des Kurses
      // `status='completed'` sind — das bedeutet Coach + alle enrollten
      // TN haben signiert (siehe recomputeSessionStatus). Früher prüften
      // wir nur TN-Signaturen des aktuellen Teilnehmers, wodurch ein TN
      // theoretisch per Direct-POST approven konnte, bevor andere TN
      // oder der Coach unterschrieben hatten.
      const allSessions = await tx
        .select({ id: schema.sessions.id, status: schema.sessions.status })
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.courseId, tok.courseId),
            isNull(schema.sessions.deletedAt),
          ),
        );
      if (allSessions.length === 0) throw new Error("NO_SESSIONS");
      // Welche Termine hat DIESER Kunde bereits signiert? Braucht das Gate, um
      // zu entscheiden, an wessen Unterschrift es noch hängt.
      const tnSignedIds = new Set(
        (
          await tx
            .select({ sessionId: schema.signatures.sessionId })
            .from(schema.signatures)
            .innerJoin(
              schema.sessions,
              eq(schema.sessions.id, schema.signatures.sessionId),
            )
            .where(
              and(
                eq(schema.sessions.courseId, tok.courseId),
                eq(schema.signatures.participantId, tok.participantId),
                eq(schema.signatures.signerType, "participant"),
              ),
            )
        ).map((r) => r.sessionId),
      );
      // "participant_open" → TN hat selbst noch offene Termine (erst signieren).
      // "coach_open" → TN fertig, nur der Coach fehlt noch (warten, nicht
      // fälschlich „signiere deine offenen Termine"). "ready" → freigabebereit.
      const gate = classifyApprovalGate(
        allSessions.map((s) => ({
          status: s.status,
          participantSigned: tnSignedIds.has(s.id),
        })),
      );
      if (gate === "participant_open") throw new Error("PARTICIPANT_OPEN");
      if (gate === "coach_open") throw new Error("COACH_OPEN");

      // Doppel-Freigabe verhindern. Unique-Index auf (course, participant)
      // würde das auch kicken, aber wir wollen eine saubere Fehlermeldung.
      const [existing] = await tx
        .select({ id: schema.participantApprovals.id })
        .from(schema.participantApprovals)
        .where(
          and(
            eq(schema.participantApprovals.courseId, tok.courseId),
            eq(schema.participantApprovals.participantId, tok.participantId),
          ),
        )
        .limit(1);
      if (existing) throw new Error("ALREADY_APPROVED");

      await tx.insert(schema.participantApprovals).values({
        courseId: tok.courseId,
        participantId: tok.participantId,
        ipAddress,
        userAgent,
      });

      await logAudit(
        {
          actorType: "participant",
          actorId: tok.participantId,
          action: "participant.approve",
          resourceType: "course",
          resourceId: tok.courseId,
          ipAddress,
          userAgent,
        },
        tx,
      );
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "TOKEN_INVALID") {
      return {
        error:
          "Link ist abgelaufen oder wurde durch einen neueren ersetzt. Bitte neuen Link beim Coach anfordern.",
      };
    }
    if (message === "NOT_ENROLLED") {
      return { error: "Du bist in diesem Kurs nicht eingeschrieben." };
    }
    if (message === "NO_SESSIONS") {
      return { error: "Der Kurs hat noch keine Termine." };
    }
    if (message === "PARTICIPANT_OPEN") {
      return {
        error:
          "Du hast noch nicht alle Termine bestätigt. Bitte zuerst alle offenen signieren.",
      };
    }
    if (message === "COACH_OPEN") {
      return {
        error:
          "Du hast deinen Teil erledigt – danke! Dein Coach muss noch nicht signierte Termine bestätigen. Danach kannst du den Nachweis freigeben.",
      };
    }
    if (message === "ALREADY_APPROVED") {
      return { error: "Du hast den Nachweis bereits freigegeben." };
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
    await notifyBildungstraegerDocumentSigned({
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
 * Schickt allen aktiven Bildungsträger-Usern im Mandanten des Teilnehmers eine
 * Info-Mail, dass ein Kunde-Dokument (DS/TNV/STV/Merge) unterschrieben wurde.
 * Best-effort — jede Zustellung ist einzeln gekapselt, ein Fehler wird nur
 * geloggt und stoppt weder die anderen Empfänger noch die Signatur. Mandant
 * wird über `participants.tenantId` bestimmt (analog zum Review-Flow, dort via
 * `users.tenantId`).
 */
async function notifyBildungstraegerDocumentSigned(params: {
  documentId: string;
  docType: DocumentTypeId;
  courseId: string;
  participantId: string;
  participantName: string;
  courseTitle: string;
}): Promise<void> {
  try {
    const [participant] = await db
      .select({ tenantId: schema.participants.tenantId })
      .from(schema.participants)
      .where(eq(schema.participants.id, params.participantId))
      .limit(1);
    if (!participant) return;

    const recipients = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.role, "bildungstraeger"),
          eq(schema.users.tenantId, participant.tenantId),
          isNull(schema.users.deletedAt),
        ),
      );
    if (recipients.length === 0) return;

    const documentLabel = getDocumentConfig(params.docType).label;
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const url = `${base}/bildungstraeger/courses/${params.courseId}/dokumente`;

    for (const r of recipients) {
      try {
        await sendDocumentSignedToBildungstraeger({
          to: r.email,
          documentLabel,
          participantName: params.participantName,
          courseTitle: params.courseTitle,
          url,
        });
      } catch (err) {
        console.error(
          `notifyBildungstraegerDocumentSigned: Zustellung an ${r.email} fehlgeschlagen`,
          err,
        );
      }
    }
  } catch (err) {
    console.error("notifyBildungstraegerDocumentSigned failed:", err);
  }
}

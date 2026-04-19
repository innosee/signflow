"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { recomputeSessionStatus } from "@/lib/session-status";

export type SignState = { error?: string } | undefined;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

/**
 * Signiert eine einzelne Session innerhalb eines aktiven Magic-Link-Tokens.
 * Token wird NICHT verbraucht — der Teilnehmer kann innerhalb der 24 h
 * weitere Sessions signieren. Replay-Schutz liegt pro Session darin, dass
 * `(session_id, course_participant_id, signer_type='participant')` nur
 * einmal eingefügt werden kann (sonst würde beim Insert ein Fehler kommen
 * weil wir die eindeutige Paarung vorher prüfen).
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

      // Session muss zum Kurs des Tokens gehören
      const [sess] = await tx
        .select({ id: schema.sessions.id })
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

      // Teilnehmer muss im Kurs eingeschrieben sein (→ course_participants-Row)
      const [cp] = await tx
        .select({ id: schema.courseParticipants.id })
        .from(schema.courseParticipants)
        .where(
          and(
            eq(schema.courseParticipants.courseId, tok.courseId),
            eq(
              schema.courseParticipants.participantId,
              tok.participantId,
            ),
          ),
        )
        .limit(1);
      if (!cp) throw new Error("NOT_ENROLLED");

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
            eq(schema.signatures.courseParticipantId, cp.id),
            eq(schema.signatures.signerType, "participant"),
          ),
        )
        .limit(1);
      if (existing.length > 0) throw new Error("ALREADY_SIGNED");

      await tx.insert(schema.signatures).values({
        sessionId: sess.id,
        courseParticipantId: cp.id,
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
      return { error: "Diese Einheit gehört nicht zu deinem Kurs." };
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
      return { error: "Diese Einheit wurde bereits bestätigt." };
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

      // Enrollment + pro TN signierten Sessions prüfen. Wir stellen
      // sicher, dass JEDE nicht-gelöschte Session eine TN-Signatur vom
      // Teilnehmer hat — ohne das wäre die finale Freigabe inhaltlich
      // falsch (es gibt noch offene Einheiten).
      const [cp] = await tx
        .select({ id: schema.courseParticipants.id })
        .from(schema.courseParticipants)
        .where(
          and(
            eq(schema.courseParticipants.courseId, tok.courseId),
            eq(schema.courseParticipants.participantId, tok.participantId),
          ),
        )
        .limit(1);
      if (!cp) throw new Error("NOT_ENROLLED");

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
      if (allSessions.some((s) => s.status !== "completed")) {
        throw new Error("SESSIONS_OPEN");
      }

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
      return { error: "Der Kurs hat noch keine Sessions." };
    }
    if (message === "SESSIONS_OPEN") {
      return {
        error:
          "Du hast noch nicht alle Einheiten bestätigt. Bitte zuerst alle offenen Termine signieren.",
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

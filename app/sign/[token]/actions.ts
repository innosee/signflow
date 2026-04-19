"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
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

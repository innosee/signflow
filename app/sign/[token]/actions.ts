"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db, schema } from "@/db";

export type SignState = { error?: string } | undefined;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

export async function submitParticipantSignature(
  _prev: SignState,
  formData: FormData,
): Promise<SignState> {
  const token = String(formData.get("token") ?? "");
  const confirmed = formData.get("confirm") === "on";
  if (!token) return { error: "Token fehlt." };
  if (!confirmed) return { error: "Bitte aktiv bestätigen." };

  const tokenHash = hashToken(token);
  const ipAddress =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  // Token-Consume + Enrollment-Lookup + Signatur-Insert in EINER Transaktion.
  // Sonst könnte bei Fehler im Insert der Link verbraucht, aber keine
  // Signatur geschrieben sein → Teilnehmer kann nie wieder signieren.
  try {
    await db.transaction(async (tx) => {
      const consumed = await tx
        .update(schema.sessionTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(schema.sessionTokens.tokenHash, tokenHash),
            isNull(schema.sessionTokens.usedAt),
            gt(schema.sessionTokens.expiresAt, new Date()),
          ),
        )
        .returning({
          sessionId: schema.sessionTokens.sessionId,
          participantId: schema.sessionTokens.participantId,
        });

      const row = consumed[0];
      if (!row) throw new Error("TOKEN_INVALID");

      const [cp] = await tx
        .select({ id: schema.courseParticipants.id })
        .from(schema.courseParticipants)
        .innerJoin(
          schema.sessions,
          eq(schema.sessions.courseId, schema.courseParticipants.courseId),
        )
        .where(
          and(
            eq(schema.sessions.id, row.sessionId),
            eq(schema.courseParticipants.participantId, row.participantId),
          ),
        )
        .limit(1);

      if (!cp) throw new Error("NOT_ENROLLED");

      await tx.insert(schema.signatures).values({
        sessionId: row.sessionId,
        courseParticipantId: cp.id,
        signerType: "participant",
        // Placeholder bis die Canvas-Signatur-Phase signature_pad + Object
        // Storage verdrahtet (siehe CLAUDE.md → Zeitplan).
        signatureUrl: "placeholder://pending-canvas-integration",
        ipAddress,
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "TOKEN_INVALID") {
      return {
        error:
          "Link ist abgelaufen oder wurde bereits verwendet. Bitte neuen Link anfordern.",
      };
    }
    if (message === "NOT_ENROLLED") {
      return { error: "Teilnehmer ist dieser Einheit nicht zugeordnet." };
    }
    throw err;
  }

  redirect(`/sign/${token}/done`);
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { consumeParticipantToken } from "@/lib/participant-tokens";

export type SignState = { error?: string } | undefined;

export async function submitParticipantSignature(
  _prev: SignState,
  formData: FormData,
): Promise<SignState> {
  const token = String(formData.get("token") ?? "");
  const confirmed = formData.get("confirm") === "on";
  if (!token) return { error: "Token fehlt." };
  if (!confirmed) return { error: "Bitte aktiv bestätigen." };

  const resolved = await consumeParticipantToken(token);
  if (!resolved) {
    return {
      error:
        "Link ist abgelaufen oder wurde bereits verwendet. Bitte neuen Link anfordern.",
    };
  }

  const ipAddress =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const cp = await db
    .select({ id: schema.courseParticipants.id })
    .from(schema.courseParticipants)
    .innerJoin(
      schema.sessions,
      eq(schema.sessions.courseId, schema.courseParticipants.courseId),
    )
    .where(
      and(
        eq(schema.sessions.id, resolved.sessionId),
        eq(schema.courseParticipants.participantId, resolved.participantId),
      ),
    )
    .limit(1);

  await db.insert(schema.signatures).values({
    sessionId: resolved.sessionId,
    courseParticipantId: cp[0]?.id ?? null,
    signerType: "participant",
    // Placeholder until the Canvas-Signatur phase wires up signature_pad + storage.
    signatureUrl: "placeholder://pending-canvas-integration",
    ipAddress,
  });

  redirect(`/sign/${token}/done`);
}

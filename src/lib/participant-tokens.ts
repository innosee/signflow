import "server-only";

import crypto from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { sendParticipantMagicLink } from "@/lib/email";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h per CLAUDE.md

function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

export async function createParticipantMagicLink(params: {
  sessionId: string;
  participantId: string;
}): Promise<{ token: string; url: string }> {
  const token = newToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db.insert(schema.sessionTokens).values({
    sessionId: params.sessionId,
    participantId: params.participantId,
    tokenHash,
    expiresAt,
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return { token, url: `${base}/sign/${token}` };
}

export async function sendParticipantInvite(params: {
  sessionId: string;
  participantId: string;
}): Promise<void> {
  const { url } = await createParticipantMagicLink(params);

  const rows = await db
    .select({
      participantName: schema.participants.name,
      participantEmail: schema.participants.email,
      courseTitle: schema.courses.title,
      sessionDate: schema.sessions.sessionDate,
    })
    .from(schema.sessions)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.sessions.courseId))
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, params.participantId),
    )
    .where(eq(schema.sessions.id, params.sessionId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error("Session oder Teilnehmer nicht gefunden.");

  await sendParticipantMagicLink({
    to: row.participantEmail,
    participantName: row.participantName,
    courseTitle: row.courseTitle,
    sessionDate: row.sessionDate,
    url,
  });
}

export type ResolvedToken = {
  tokenId: string;
  sessionId: string;
  participantId: string;
  participantName: string;
  participantEmail: string;
  courseTitle: string;
  sessionDate: string;
  sessionTopic: string;
};

/**
 * Validates a participant magic-link token. Returns null if the token doesn't
 * exist, has expired, or has already been used. Does NOT mark the token as
 * used — consume it explicitly when the participant submits their signature.
 */
export async function resolveParticipantToken(
  token: string,
): Promise<ResolvedToken | null> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const rows = await db
    .select({
      tokenId: schema.sessionTokens.id,
      expiresAt: schema.sessionTokens.expiresAt,
      sessionId: schema.sessionTokens.sessionId,
      participantId: schema.sessionTokens.participantId,
      participantName: schema.participants.name,
      participantEmail: schema.participants.email,
      courseTitle: schema.courses.title,
      sessionDate: schema.sessions.sessionDate,
      sessionTopic: schema.sessions.topic,
    })
    .from(schema.sessionTokens)
    .innerJoin(
      schema.sessions,
      eq(schema.sessions.id, schema.sessionTokens.sessionId),
    )
    .innerJoin(schema.courses, eq(schema.courses.id, schema.sessions.courseId))
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.sessionTokens.participantId),
    )
    .where(
      and(
        eq(schema.sessionTokens.tokenHash, tokenHash),
        isNull(schema.sessionTokens.usedAt),
        gt(schema.sessionTokens.expiresAt, now),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    tokenId: row.tokenId,
    sessionId: row.sessionId,
    participantId: row.participantId,
    participantName: row.participantName,
    participantEmail: row.participantEmail,
    courseTitle: row.courseTitle,
    sessionDate: row.sessionDate,
    sessionTopic: row.sessionTopic,
  };
}

/**
 * Atomically consumes a participant token. Returns the resolved token if the
 * consumption succeeded (row updated, was unused AND unexpired), null
 * otherwise — prevents replay/double-use AND prevents consuming an already-
 * expired token in the gap between resolve and consume.
 */
export async function consumeParticipantToken(
  token: string,
): Promise<ResolvedToken | null> {
  const resolved = await resolveParticipantToken(token);
  if (!resolved) return null;

  const updated = await db
    .update(schema.sessionTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.sessionTokens.id, resolved.tokenId),
        isNull(schema.sessionTokens.usedAt),
        gt(schema.sessionTokens.expiresAt, new Date()),
      ),
    )
    .returning({ id: schema.sessionTokens.id });

  if (updated.length === 0) return null;
  return resolved;
}

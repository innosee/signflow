import "server-only";

import crypto from "node:crypto";
import { and, asc, eq, gt, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { sendParticipantMagicLink } from "@/lib/email";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h per CLAUDE.md

function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

/**
 * Invalidiert alle noch gültigen Tokens für eine bestimmte Paarung
 * (course × participant). Wird aufgerufen, bevor ein neuer Magic Link
 * ausgestellt wird — sorgt dafür, dass immer nur ein einziger Link pro
 * Teilnehmer-Kurs gleichzeitig aktiv ist.
 */
async function revokeExistingTokens(params: {
  courseId: string;
  participantId: string;
}): Promise<void> {
  await db
    .update(schema.participantAccessTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.participantAccessTokens.courseId, params.courseId),
        eq(schema.participantAccessTokens.participantId, params.participantId),
        isNull(schema.participantAccessTokens.usedAt),
      ),
    );
}

/**
 * Erzeugt einen neuen Magic-Link-Token für die Paarung (course × participant).
 * Alte Tokens für dieselbe Paarung werden vorher invalidiert (nur einer
 * gleichzeitig aktiv).
 */
export async function createParticipantMagicLink(params: {
  courseId: string;
  participantId: string;
}): Promise<{ token: string; url: string }> {
  await revokeExistingTokens(params);

  const token = newToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db.insert(schema.participantAccessTokens).values({
    courseId: params.courseId,
    participantId: params.participantId,
    tokenHash,
    expiresAt,
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return { token, url: `${base}/sign/${token}` };
}

/**
 * High-level helper: generiert einen frischen Link UND verschickt die
 * Magic-Link-Mail. Wird vom Coach-Dashboard per "Teilnehmer benachrichtigen"
 * aufgerufen (manuell ausgelöst, kein Cron im V1).
 */
export async function sendParticipantInvite(params: {
  courseId: string;
  participantId: string;
}): Promise<void> {
  const { url } = await createParticipantMagicLink(params);

  const rows = await db
    .select({
      participantName: schema.participants.name,
      participantEmail: schema.participants.email,
      courseTitle: schema.courses.title,
    })
    .from(schema.courses)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, params.participantId),
    )
    .where(eq(schema.courses.id, params.courseId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error("Kurs oder Teilnehmer nicht gefunden.");

  await sendParticipantMagicLink({
    to: row.participantEmail,
    participantName: row.participantName,
    courseTitle: row.courseTitle,
    // sessionDate bleibt Platzhalter — die Mail betrifft jetzt den ganzen
    // Kurs, nicht eine einzelne Session. Könnte später durch "X offene
    // Sessions" ersetzt werden.
    sessionDate: "laufender Kurs",
    url,
  });
}

export type ResolvedToken = {
  tokenId: string;
  courseId: string;
  participantId: string;
  participantName: string;
  participantEmail: string;
  courseTitle: string;
  sessions: Array<{
    id: string;
    sessionDate: string;
    topic: string;
    anzahlUe: string;
    modus: "praesenz" | "online";
    isErstgespraech: boolean;
    hasParticipantSignature: boolean;
  }>;
};

/**
 * Validiert einen Magic Link und gibt den Kurs-Kontext inkl. aller Sessions
 * (signiert + noch offen) zurück. Verbraucht den Token NICHT — innerhalb der
 * 24-h-Gültigkeit kann der Teilnehmer beliebig viele Sessions signieren.
 */
export async function resolveParticipantToken(
  token: string,
): Promise<ResolvedToken | null> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const rows = await db
    .select({
      tokenId: schema.participantAccessTokens.id,
      courseId: schema.participantAccessTokens.courseId,
      participantId: schema.participantAccessTokens.participantId,
      participantName: schema.participants.name,
      participantEmail: schema.participants.email,
      courseTitle: schema.courses.title,
    })
    .from(schema.participantAccessTokens)
    .innerJoin(
      schema.courses,
      eq(schema.courses.id, schema.participantAccessTokens.courseId),
    )
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.participantAccessTokens.participantId),
    )
    .where(
      and(
        eq(schema.participantAccessTokens.tokenHash, tokenHash),
        isNull(schema.participantAccessTokens.usedAt),
        gt(schema.participantAccessTokens.expiresAt, now),
      ),
    )
    .limit(1);

  const head = rows[0];
  if (!head) return null;

  // Alle Sessions des Kurses + Info ob der Teilnehmer bereits eine Signatur
  // geleistet hat. Der Join auf signatures filtert pro (session, participant)
  // anhand von course_participants.
  const [cp] = await db
    .select({ id: schema.courseParticipants.id })
    .from(schema.courseParticipants)
    .where(
      and(
        eq(schema.courseParticipants.courseId, head.courseId),
        eq(schema.courseParticipants.participantId, head.participantId),
      ),
    )
    .limit(1);

  if (!cp) return null; // Teilnehmer ist gar nicht im Kurs

  const rawSessions = await db
    .select({
      id: schema.sessions.id,
      sessionDate: schema.sessions.sessionDate,
      topic: schema.sessions.topic,
      anzahlUe: schema.sessions.anzahlUe,
      modus: schema.sessions.modus,
      isErstgespraech: schema.sessions.isErstgespraech,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, head.courseId),
        isNull(schema.sessions.deletedAt),
      ),
    )
    .orderBy(asc(schema.sessions.sessionDate));

  const signedSessionIds = new Set(
    (
      await db
        .select({ sessionId: schema.signatures.sessionId })
        .from(schema.signatures)
        .where(
          and(
            eq(schema.signatures.courseParticipantId, cp.id),
            eq(schema.signatures.signerType, "participant"),
          ),
        )
    ).map((r) => r.sessionId),
  );

  return {
    tokenId: head.tokenId,
    courseId: head.courseId,
    participantId: head.participantId,
    participantName: head.participantName,
    participantEmail: head.participantEmail,
    courseTitle: head.courseTitle,
    sessions: rawSessions.map((s) => ({
      id: s.id,
      sessionDate: s.sessionDate,
      topic: s.topic,
      anzahlUe: s.anzahlUe,
      modus: s.modus,
      isErstgespraech: s.isErstgespraech,
      hasParticipantSignature: signedSessionIds.has(s.id),
    })),
  };
}

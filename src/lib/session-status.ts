import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

// count(*) via Drizzle-SQL mit explizitem ::int-Cast. Drizzle liefert bei
// count-Aggregaten sonst einen string (wegen pg bigint → string-Mapping),
// was in Vergleichen zu subtilen Bugs führen würde.
const countStar = () => sql<number>`count(*)::int`;

/**
 * Leitet den Session-Status aus den existierenden Signaturen ab und schreibt
 * das Resultat auf `sessions.status`. Wird nach Coach- und Teilnehmer-Signatur
 * aufgerufen, damit die UI (Geleistete UE, Badges) konsistent bleibt.
 *
 * Regeln:
 * - Keine Coach-Signatur                      → `pending`
 * - Coach hat signiert, aber noch TN offen    → `coach_signed`
 * - Coach + alle eingeschriebenen TN signiert → `completed`
 *
 * Akzeptiert optional eine laufende Transaktion, damit Insert + Status-Update
 * atomar passieren.
 */
export async function recomputeSessionStatus(
  sessionId: string,
  executor: DbOrTx = db,
): Promise<"pending" | "coach_signed" | "completed" | null> {
  const [sess] = await executor
    .select({ id: schema.sessions.id, courseId: schema.sessions.courseId })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);
  if (!sess) return null;

  const [coachSig] = await executor
    .select({ id: schema.signatures.id })
    .from(schema.signatures)
    .where(
      and(
        eq(schema.signatures.sessionId, sess.id),
        eq(schema.signatures.signerType, "coach"),
      ),
    )
    .limit(1);
  const coachSigned = !!coachSig;

  const [{ count: enrolledCount } = { count: 0 }] = await executor
    .select({ count: countStar() })
    .from(schema.courseParticipants)
    .where(eq(schema.courseParticipants.courseId, sess.courseId));

  const [{ count: tnSigned } = { count: 0 }] = await executor
    .select({ count: countStar() })
    .from(schema.signatures)
    .where(
      and(
        eq(schema.signatures.sessionId, sess.id),
        eq(schema.signatures.signerType, "participant"),
      ),
    );

  let next: "pending" | "coach_signed" | "completed";
  if (!coachSigned) {
    next = "pending";
  } else if (enrolledCount > 0 && tnSigned >= enrolledCount) {
    next = "completed";
  } else {
    next = "coach_signed";
  }

  await executor
    .update(schema.sessions)
    .set({ status: next })
    .where(eq(schema.sessions.id, sess.id));

  return next;
}

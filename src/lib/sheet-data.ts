import "server-only";

import { and, asc, eq, isNull, or } from "drizzle-orm";

import { db, schema } from "@/db";
import type { StundennachweisSheet } from "@/components/stundennachweis";
import { resolveAssetUrl } from "@/lib/storage";

/**
 * Lädt alle Daten, die für das AfA-Stundennachweis-Sheet eines Teilnehmers
 * nötig sind — bei Coach-Druckvorschau UND bei TN-Preview identisch. Vorher
 * lagen diese Queries inline im Coach-Print-Page; extrahiert, damit die
 * Preview-Sicht des Teilnehmers garantiert denselben Datensatz rendert
 * (HTML-as-Source-of-Truth).
 *
 * Enforced:
 *   - Teilnehmer muss im Kurs eingeschrieben sein → gibt sonst `null`
 *   - Coach-Signaturen werden aller Kurse ausgewertet, aber TN-Signaturen
 *     nur vom angefragten Teilnehmer gejoined (sonst verzerrt das Sheet)
 *
 * Gibt `null` zurück, wenn Kurs oder Teilnehmer-Enrollment fehlt — der
 * Aufrufer entscheidet, ob das 404 oder eine andere Fehlermeldung ist.
 */
export async function loadStundennachweisSheet(params: {
  courseId: string;
  participantId: string;
}): Promise<StundennachweisSheet | null> {
  const [ctx] = await db
    .select({
      title: schema.courses.title,
      avgsNummer: schema.courses.avgsNummer,
      durchfuehrungsort: schema.courses.durchfuehrungsort,
      startDate: schema.courses.startDate,
      endDate: schema.courses.endDate,
      anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
      flagUnter2Termine: schema.courses.flagUnter2Termine,
      flagVorzeitigesEnde: schema.courses.flagVorzeitigesEnde,
      begruendungText: schema.courses.begruendungText,
      bedarfstraegerName: schema.bedarfstraeger.name,
      bedarfstraegerType: schema.bedarfstraeger.type,
      coachName: schema.users.name,
    })
    .from(schema.courses)
    .innerJoin(
      schema.bedarfstraeger,
      eq(schema.bedarfstraeger.id, schema.courses.bedarfstraegerId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .where(
      and(
        eq(schema.courses.id, params.courseId),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);
  if (!ctx) return null;

  // 1:1: Der angefragte Teilnehmer muss der Kunde dieses Kurses sein.
  const [enrollment] = await db
    .select({
      participantName: schema.participants.name,
      kundenNr: schema.participants.kundenNr,
    })
    .from(schema.courses)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(
      and(
        eq(schema.courses.id, params.courseId),
        eq(schema.courses.participantId, params.participantId),
      ),
    )
    .limit(1);
  if (!enrollment) return null;

  // 1:1: Alle nicht-gelöschten Termine des Kurses gehören dem einen Kunden.
  const sessions = await db
    .select({
      id: schema.sessions.id,
      sessionDate: schema.sessions.sessionDate,
      topic: schema.sessions.topic,
      anzahlUe: schema.sessions.anzahlUe,
      modus: schema.sessions.modus,
      isErstgespraech: schema.sessions.isErstgespraech,
      geeignet: schema.sessions.geeignet,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, params.courseId),
        isNull(schema.sessions.deletedAt),
      ),
    )
    .orderBy(asc(schema.sessions.sessionDate));

  // Nur Signaturen dieses Teilnehmers + alle Coach-Signaturen — sonst
  // würden TN-Signaturen anderer Teilnehmer das Sheet verzerren.
  const signatures = await db
    .select({
      id: schema.signatures.id,
      sessionId: schema.signatures.sessionId,
      signerType: schema.signatures.signerType,
      signatureUrl: schema.signatures.signatureUrl,
      signedAt: schema.signatures.signedAt,
      ipAddress: schema.signatures.ipAddress,
    })
    .from(schema.signatures)
    .innerJoin(
      schema.sessions,
      eq(schema.sessions.id, schema.signatures.sessionId),
    )
    .where(
      and(
        eq(schema.sessions.courseId, params.courseId),
        or(
          eq(schema.signatures.signerType, "coach"),
          and(
            eq(schema.signatures.signerType, "participant"),
            eq(schema.signatures.participantId, params.participantId),
          ),
        ),
      ),
    );

  // Final-Approval des TN (CLAUDE.md Schritt 8) — wird unter den Signaturen
  // im Audit-Trail als eigene Zeile gerendert. Höchstens 1 Eintrag (Unique-
  // Index auf (course_id, participant_id)).
  const [approval] = await db
    .select({
      approvedAt: schema.participantApprovals.approvedAt,
      ipAddress: schema.participantApprovals.ipAddress,
    })
    .from(schema.participantApprovals)
    .where(
      and(
        eq(schema.participantApprovals.courseId, params.courseId),
        eq(schema.participantApprovals.participantId, params.participantId),
      ),
    )
    .limit(1);

  const sigBySession = new Map<
    string,
    {
      coachSignatureUrl: string | null;
      coachSignedAt: string | null;
      participantSignatureUrl: string | null;
      participantSignedAt: string | null;
    }
  >();
  // Storage-Werte (Object-Key bei R2 oder URL bei Legacy-Vercel-Blob) auf
  // signed/public URLs auflösen, bevor wir sie ins Sheet rendern. Sequenziell
  // pro Eintrag, aber `resolveAssetUrl` cached innerhalb des Renders, sodass
  // wiederholte Coach-Signaturen nicht mehrfach gesigned werden.
  for (const sig of signatures) {
    const slot = sigBySession.get(sig.sessionId) ?? {
      coachSignatureUrl: null,
      coachSignedAt: null,
      participantSignatureUrl: null,
      participantSignedAt: null,
    };
    const resolved = await resolveAssetUrl(sig.signatureUrl);
    if (sig.signerType === "coach") {
      slot.coachSignatureUrl = resolved;
      slot.coachSignedAt = sig.signedAt.toISOString();
    } else {
      slot.participantSignatureUrl = resolved;
      slot.participantSignedAt = sig.signedAt.toISOString();
    }
    sigBySession.set(sig.sessionId, slot);
  }

  const sessionDateById = new Map(sessions.map((s) => [s.id, s.sessionDate]));

  // Audit-Trail aufbauen: alle Signaturen + (max. 1) Approval, chronologisch
  // sortiert. Coach-Signaturen werden mit dem Coach-Namen gelabelt; TN-
  // Signaturen + Approval mit dem TN-Namen. Andere TN-Namen (wenn mehrere
  // im Kurs sind) tauchen hier bewusst NICHT auf — dieses Sheet ist pro
  // (Kurs × TN) und der Audit muss exakt dem Sheet entsprechen.
  type AuditEntry = StundennachweisSheet["audit"][number];
  const auditEntries: AuditEntry[] = [];
  for (const sig of signatures) {
    auditEntries.push({
      key: `sig-${sig.id}`,
      kind: sig.signerType === "coach" ? "coach-sign" : "participant-sign",
      at: sig.signedAt.toISOString(),
      signerName:
        sig.signerType === "coach"
          ? ctx.coachName
          : enrollment.participantName,
      sessionDate: sessionDateById.get(sig.sessionId) ?? null,
      ip: sig.ipAddress,
    });
  }
  if (approval) {
    auditEntries.push({
      key: `approval-${params.participantId}`,
      kind: "participant-approval",
      at: approval.approvedAt.toISOString(),
      signerName: enrollment.participantName,
      sessionDate: null,
      ip: approval.ipAddress,
    });
  }
  auditEntries.sort((a, b) => a.at.localeCompare(b.at));

  return {
    course: {
      title: ctx.title,
      avgsNummer: ctx.avgsNummer,
      durchfuehrungsort: ctx.durchfuehrungsort,
      startDate: ctx.startDate,
      endDate: ctx.endDate,
      anzahlBewilligteUe: ctx.anzahlBewilligteUe,
      flagUnter2Termine: ctx.flagUnter2Termine,
      flagVorzeitigesEnde: ctx.flagVorzeitigesEnde,
      begruendungText: ctx.begruendungText,
    },
    bedarfstraeger: {
      name: ctx.bedarfstraegerName,
      type: ctx.bedarfstraegerType,
    },
    coach: { name: ctx.coachName },
    participant: {
      name: enrollment.participantName,
      kundenNr: enrollment.kundenNr,
    },
    sessions: sessions.map((s) => {
      const sig = sigBySession.get(s.id);
      return {
        id: s.id,
        sessionDate: s.sessionDate,
        topic: s.topic,
        anzahlUe: s.anzahlUe,
        modus: s.modus,
        isErstgespraech: s.isErstgespraech,
        geeignet: s.geeignet,
        coachSignatureUrl: sig?.coachSignatureUrl ?? null,
        coachSignedAt: sig?.coachSignedAt ?? null,
        participantSignatureUrl: sig?.participantSignatureUrl ?? null,
        participantSignedAt: sig?.participantSignedAt ?? null,
      };
    }),
    audit: auditEntries,
  };
}

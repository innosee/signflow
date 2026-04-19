import "server-only";

import { and, asc, eq, isNull, or } from "drizzle-orm";

import { db, schema } from "@/db";
import type { StundennachweisSheet } from "@/components/stundennachweis";

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

  const [enrollment] = await db
    .select({
      cpId: schema.courseParticipants.id,
      participantName: schema.participants.name,
      kundenNr: schema.participants.kundenNr,
    })
    .from(schema.courseParticipants)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courseParticipants.participantId),
    )
    .where(
      and(
        eq(schema.courseParticipants.courseId, params.courseId),
        eq(schema.courseParticipants.participantId, params.participantId),
      ),
    )
    .limit(1);
  if (!enrollment) return null;

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
      sessionId: schema.signatures.sessionId,
      signerType: schema.signatures.signerType,
      signatureUrl: schema.signatures.signatureUrl,
      signedAt: schema.signatures.signedAt,
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
            eq(schema.signatures.courseParticipantId, enrollment.cpId),
          ),
        ),
      ),
    );

  const sigBySession = new Map<
    string,
    {
      coachSignatureUrl: string | null;
      coachSignedAt: string | null;
      participantSignatureUrl: string | null;
      participantSignedAt: string | null;
    }
  >();
  for (const sig of signatures) {
    const slot = sigBySession.get(sig.sessionId) ?? {
      coachSignatureUrl: null,
      coachSignedAt: null,
      participantSignatureUrl: null,
      participantSignedAt: null,
    };
    if (sig.signerType === "coach") {
      slot.coachSignatureUrl = sig.signatureUrl;
      slot.coachSignedAt = sig.signedAt.toISOString();
    } else {
      slot.participantSignatureUrl = sig.signatureUrl;
      slot.participantSignedAt = sig.signedAt.toISOString();
    }
    sigBySession.set(sig.sessionId, slot);
  }

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
  };
}

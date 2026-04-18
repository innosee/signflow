"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { assertNotImpersonating, requireCoach } from "@/lib/dal";
import { sendParticipantInvite } from "@/lib/participant-tokens";

export type SessionFormState = { error?: string } | undefined;

async function requireOwnedCourseId(
  courseId: string,
  coachId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.coachId, coachId),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

export async function createSession(
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const session = await requireCoach();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const sessionDate = String(formData.get("sessionDate") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();
  const modus = String(formData.get("modus") ?? "").trim();
  const isErstgespraech = formData.get("isErstgespraech") === "on";
  const anzahlUeRaw = String(formData.get("anzahlUe") ?? "").trim();
  const geeignetRaw = String(formData.get("geeignet") ?? "").trim();

  if (!courseId) return { error: "Kurs fehlt." };
  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  if (!sessionDate) return { error: "Datum fehlt." };
  if (!topic) return { error: "Themen / Inhalte fehlen." };
  if (modus !== "praesenz" && modus !== "online") {
    return { error: "Modus muss Präsenz oder Online sein." };
  }

  // UE + Geeignet hängen voneinander ab: beim Erstgespräch gilt UE=0 und
  // geeignet wird zur Pflicht; bei regulärer Session ist UE>0 und geeignet
  // wird gar nicht erfasst. Der DB-Check `sessions_erstgespraech_consistency`
  // erzwingt dasselbe — wir validieren hier nochmal, um dem Coach eine
  // klare Fehlermeldung zu geben statt eines Constraint-Violation-Stack.
  let anzahlUe: string;
  let geeignet: boolean | null;
  if (isErstgespraech) {
    anzahlUe = "0";
    if (geeignetRaw !== "ja" && geeignetRaw !== "nein") {
      return {
        error:
          "Beim Erstgespräch musst du angeben, ob die Teilnehmerin für die Maßnahme geeignet ist.",
      };
    }
    geeignet = geeignetRaw === "ja";
  } else {
    const ue = Number.parseFloat(anzahlUeRaw.replace(",", "."));
    if (!Number.isFinite(ue) || ue <= 0) {
      return { error: "UE muss eine positive Zahl sein." };
    }
    // numeric(3,1) → maximal 99.9, in 0,5er-Schritten (AfA-Konvention).
    if (Math.round(ue * 2) !== ue * 2) {
      return { error: "UE muss in 0,5er-Schritten angegeben werden." };
    }
    if (ue > 24) {
      return { error: "Eine Session darf 24 UE nicht überschreiten." };
    }
    anzahlUe = ue.toFixed(1);
    geeignet = null;
  }

  try {
    await db.insert(schema.sessions).values({
      courseId: ownedCourseId,
      sessionDate,
      topic,
      modus,
      anzahlUe,
      isErstgespraech,
      geeignet,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Session konnte nicht angelegt werden (${message}).` };
  }

  redirect(`/coach/courses/${ownedCourseId}`);
}

export type NotifyState =
  | { success?: number; failedEmails?: string[]; error?: string }
  | undefined;

/**
 * Löst pro Teilnehmer im Kurs einen neuen Magic-Link aus und versendet die
 * Einladungs-Mail. Alte Links für dieselbe (course, participant)-Paarung
 * werden von `createParticipantMagicLink` invalidiert — es ist immer nur
 * ein Link gleichzeitig aktiv.
 *
 * Fehler beim Versand an einzelne Teilnehmer brechen den Lauf nicht ab —
 * der Coach soll sehen, wie viele erfolgreich waren und wer fehlschlug.
 */
export async function notifyParticipants(
  _prev: NotifyState,
  formData: FormData,
): Promise<NotifyState> {
  const session = await requireCoach();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { error: "Kurs fehlt." };

  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  const participants = await db
    .select({
      participantId: schema.participants.id,
      email: schema.participants.email,
    })
    .from(schema.courseParticipants)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courseParticipants.participantId),
    )
    .where(eq(schema.courseParticipants.courseId, ownedCourseId));

  if (participants.length === 0) {
    return { error: "Kurs hat noch keine Teilnehmer." };
  }

  const failedEmails: string[] = [];
  let success = 0;
  for (const p of participants) {
    try {
      await sendParticipantInvite({
        courseId: ownedCourseId,
        participantId: p.participantId,
      });
      success++;
    } catch (err) {
      console.error(`notifyParticipants failed for ${p.email}:`, err);
      failedEmails.push(p.email);
    }
  }

  revalidatePath(`/coach/courses/${ownedCourseId}`);
  return {
    success,
    failedEmails: failedEmails.length > 0 ? failedEmails : undefined,
  };
}

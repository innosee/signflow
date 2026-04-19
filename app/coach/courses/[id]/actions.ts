"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { assertNotImpersonating, requireCoach } from "@/lib/dal";
import { sendParticipantInvite } from "@/lib/participant-tokens";
import { recomputeSessionStatus } from "@/lib/session-status";

export type SessionFormState = { error?: string } | undefined;

/**
 * Schickt automatisch Magic-Links an alle eingeschriebenen Teilnehmer,
 * die gerade KEINEN aktiven Link haben (also weder einen unbenutzten noch
 * einen unabgelaufenen). Wird vom Coach-Sign-Flow ausgelöst: sobald der
 * Coach eine Session signiert, soll der TN ohne manuellen Klick auf
 * „Teilnehmer benachrichtigen" einen Link bekommen. Wenn schon ein Link
 * aktiv ist, skippen wir — der enthält die neue Session ohnehin (Liste
 * wird on-demand aufgelöst), so gibt's keine Mail-Spam bei mehreren
 * kurz aufeinanderfolgenden Coach-Signaturen.
 */
async function autoNotifyParticipantsWithoutActiveToken(
  courseId: string,
): Promise<void> {
  const now = new Date();

  const activeTokenParticipantIds = (
    await db
      .select({
        participantId: schema.participantAccessTokens.participantId,
      })
      .from(schema.participantAccessTokens)
      .where(
        and(
          eq(schema.participantAccessTokens.courseId, courseId),
          isNull(schema.participantAccessTokens.usedAt),
          gt(schema.participantAccessTokens.expiresAt, now),
        ),
      )
  ).map((r) => r.participantId);
  const withActive = new Set(activeTokenParticipantIds);

  const enrolled = await db
    .select({ participantId: schema.courseParticipants.participantId })
    .from(schema.courseParticipants)
    .where(eq(schema.courseParticipants.courseId, courseId));

  for (const p of enrolled) {
    if (withActive.has(p.participantId)) continue;
    try {
      await sendParticipantInvite({
        courseId,
        participantId: p.participantId,
      });
    } catch (err) {
      // Mailversand-Fehler dürfen die Coach-Signatur nicht blockieren —
      // der Coach kann über "Teilnehmer benachrichtigen" manuell
      // nachlegen.
      console.error(
        `auto-notify failed for participant ${p.participantId}:`,
        err,
      );
    }
  }
}

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

  // Wochenend-Sperre: Sa/So sind für Coachings nicht zulässig. Datum
  // als pure Kalendertag interpretieren (sessionDate ist YYYY-MM-DD,
  // nicht UTC-Midnight) — split statt new Date(), damit kein TZ-Schlag
  // den Tag verschiebt. Malformed-Input wird hart abgelehnt statt
  // stillschweigend die Validierung zu skippen.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return { error: "Datum muss im Format JJJJ-MM-TT vorliegen." };
  }
  const [y, m, d] = sessionDate.split("-").map((s) => Number.parseInt(s, 10));
  // Date.UTC + getUTCDay um lokale TZ-Effekte komplett auszuschließen.
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (weekday === 0 || weekday === 6) {
    return {
      error: "Am Wochenende (Sa/So) können keine Coachings stattfinden.",
    };
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

export type AddParticipantState =
  | { error?: string; reused?: boolean }
  | undefined;

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * Nachträglich einen Teilnehmer zu einem bestehenden Kurs einschreiben.
 * Analog zur Teilnehmer-Logik in `createCourse`: existiert die E-Mail
 * schon in `participants` → bestehender Datensatz wird wiederverwendet
 * (Name + Kunden-Nr. bleiben), ansonsten neuer Teilnehmer anlegen. In
 * beiden Fällen landet eine Zeile in `course_participants`.
 */
export async function addParticipant(
  _prev: AddParticipantState,
  formData: FormData,
): Promise<AddParticipantState> {
  const session = await requireCoach();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const kundenNr = String(formData.get("kundenNr") ?? "").trim();

  if (!courseId) return { error: "Kurs fehlt." };
  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  if (!name || !email || !kundenNr) {
    return { error: "Name, E-Mail und Kunden-Nr. sind Pflicht." };
  }
  if (!looksLikeEmail(email)) {
    // E-Mail nicht in die Fehlermeldung echo'en — PII gehört nicht in
    // Error-Logs oder Browser-DevTools.
    return { error: "Ungültige E-Mail-Adresse." };
  }

  let reused = false;
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: schema.participants.id })
        .from(schema.participants)
        .where(eq(schema.participants.email, email))
        .limit(1);

      let participantId: string;
      if (existing) {
        participantId = existing.id;
        reused = true;
      } else {
        const [created] = await tx
          .insert(schema.participants)
          .values({ name, email, kundenNr })
          .returning({ id: schema.participants.id });
        if (!created) throw new Error("PARTICIPANT_INSERT_FAILED");
        participantId = created.id;
      }

      // Double-Enrollment vermeiden — es gibt einen UNIQUE-Index auf
      // (courseId, participantId), der uns sonst einen rohen Fehler gäbe.
      const [already] = await tx
        .select({ id: schema.courseParticipants.id })
        .from(schema.courseParticipants)
        .where(
          and(
            eq(schema.courseParticipants.courseId, ownedCourseId),
            eq(schema.courseParticipants.participantId, participantId),
          ),
        )
        .limit(1);
      if (already) throw new Error("ALREADY_ENROLLED");

      await tx.insert(schema.courseParticipants).values({
        courseId: ownedCourseId,
        participantId,
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "ALREADY_ENROLLED") {
      return { error: "Dieser Teilnehmer ist bereits im Kurs." };
    }
    return { error: `Teilnehmer konnte nicht hinzugefügt werden (${message}).` };
  }

  redirect(
    `/coach/courses/${ownedCourseId}${reused ? "?reused=1" : ""}`,
  );
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

export type SignSessionState = { error?: string } | undefined;

/**
 * Coach bestätigt eine Session: aktive Bestätigung per Checkbox + Zeitstempel,
 * die gespeicherte Coach-Unterschrift (users.signature_url) wird als Snapshot
 * in die Signatur-Zeile übernommen. Danach wird `sessions.status` neu
 * berechnet (pending → coach_signed, ggf. direkt completed wenn alle TN
 * bereits signiert haben).
 */
export async function signSessionAsCoach(
  _prev: SignSessionState,
  formData: FormData,
): Promise<SignSessionState> {
  const session = await requireCoach();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const confirmed = formData.get("confirm") === "on";
  if (!courseId || !sessionId) return { error: "Kurs oder Session fehlt." };
  if (!confirmed) return { error: "Bitte aktiv bestätigen." };

  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  const [coach] = await db
    .select({ signatureUrl: schema.users.signatureUrl })
    .from(schema.users)
    .where(eq(schema.users.id, coachId))
    .limit(1);
  const coachSignatureUrl = coach?.signatureUrl ?? null;
  if (!coachSignatureUrl) {
    return {
      error:
        'Du hast noch keine Unterschrift hinterlegt. Lege sie unter „Unterschrift" an.',
    };
  }

  const ipAddress =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  try {
    await db.transaction(async (tx) => {
      // Session muss zum Kurs gehören + noch nicht gelöscht sein.
      const [sess] = await tx
        .select({ id: schema.sessions.id })
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.id, sessionId),
            eq(schema.sessions.courseId, ownedCourseId),
            isNull(schema.sessions.deletedAt),
          ),
        )
        .limit(1);
      if (!sess) throw new Error("SESSION_NOT_FOUND");

      // Doppel-Signatur verhindern. Der Check-Constraint
      // `signatures_signer_type_cp_consistency` stellt sicher, dass
      // coach-Signaturen course_participant_id=null haben.
      const [existing] = await tx
        .select({ id: schema.signatures.id })
        .from(schema.signatures)
        .where(
          and(
            eq(schema.signatures.sessionId, sess.id),
            eq(schema.signatures.signerType, "coach"),
          ),
        )
        .limit(1);
      if (existing) throw new Error("ALREADY_SIGNED");

      await tx.insert(schema.signatures).values({
        sessionId: sess.id,
        courseParticipantId: null,
        signerType: "coach",
        signatureUrl: coachSignatureUrl,
        ipAddress,
      });

      await recomputeSessionStatus(sess.id, tx);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "SESSION_NOT_FOUND") {
      return { error: "Session nicht gefunden." };
    }
    if (message === "ALREADY_SIGNED") {
      return { error: "Diese Session hast du bereits bestätigt." };
    }
    return { error: `Signatur fehlgeschlagen (${message}).` };
  }

  // Auto-Notify: TN ohne aktiven Magic-Link werden direkt angeschrieben,
  // sodass „Coach signiert" nicht im UI-Limbo „wartet auf TN" steckenbleibt
  // ohne dass der TN davon erfährt. Bewusst NACH dem Transaction-Commit,
  // damit die Signatur auch bei Mail-Problemen persistiert ist.
  await autoNotifyParticipantsWithoutActiveToken(ownedCourseId);

  revalidatePath(`/coach/courses/${ownedCourseId}`);
  return undefined;
}

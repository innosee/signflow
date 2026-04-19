"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { assertNotImpersonating, requireCoach } from "@/lib/dal";
import { sealWithFes } from "@/lib/firma";
import {
  sendParticipantInvite,
  sendParticipantPreviewInvite,
} from "@/lib/participant-tokens";
import { recomputeSessionStatus } from "@/lib/session-status";

export type SessionFormState = { error?: string } | undefined;

/**
 * Schickt bei jedem Coach-Sign einen frischen Magic-Link an alle
 * eingeschriebenen Teilnehmer des Kurses. Alte Tokens werden durch
 * `createParticipantMagicLink` (revoke + re-issue in einer Tx)
 * invalidiert — der TN hat nach jedem Coach-Sign garantiert einen
 * aktuellen 24-h-Link.
 *
 * Frühere Version hatte einen „skip wenn aktiver Link da" Guard — der
 * war zu aggressiv: nach einmaligem Benachrichtigen blieb der TN für
 * 24 h ohne Mail, obwohl der Coach zwischenzeitlich weitere Sessions
 * signiert hatte. Der Coach erwartet 1:1 Mapping Coach-Sign → Mail.
 * Bei realem Batch-Signing (mehrere Sessions binnen Sekunden) gibt's
 * ggf. mehrere Mails in Folge — akzeptiert als Preis für garantierten
 * Notify. Debounce können wir später per expliziter `created_at`-
 * Spalte nachrüsten.
 */
async function autoNotifyAllParticipants(courseId: string): Promise<void> {
  const enrolled = await db
    .select({ participantId: schema.courseParticipants.participantId })
    .from(schema.courseParticipants)
    .where(eq(schema.courseParticipants.courseId, courseId));

  for (const p of enrolled) {
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
  // Date.UTC rollt Overflow-Werte still um (2026-02-30 → 2026-03-02).
  // Wir prüfen per Round-Trip, dass die Eingabe auch ein echtes Kalenderdatum
  // ist — sonst würde die Wochenend-Logik auf dem Ersatz-Datum rechnen und
  // der Insert später an der date-Spalte der DB crashen.
  const parsed = new Date(Date.UTC(y, m - 1, d));
  const isValidDate =
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d;
  if (!isValidDate) {
    return { error: "Ungültiges Datum (Monat/Tag existiert nicht)." };
  }
  const weekday = parsed.getUTCDay();
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

/**
 * Triggert an alle Teilnehmer eine Preview-Mail (neuer 24-h-Token + Mail
 * mit Freigabe-CTA). Nur erlaubt, wenn jede nicht-gelöschte Session des
 * Kurses `status = 'completed'` hat (= Coach + alle TN signiert).
 *
 * Dieselbe Token-Infrastruktur wie beim normalen Magic-Link — die Sign-
 * Page erkennt anhand des Signatur-Stands, dass jetzt der Preview-Modus
 * angezeigt wird. Freigeben-Klick landet in `participant_approvals`.
 */
export async function sendPreviewToParticipants(
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

  // Gate: jede Session muss vollständig signiert sein. Auch "no sessions"
  // ist kein valider Preview-Trigger — es gäbe nichts freizugeben.
  const openSessions = await db
    .select({ id: schema.sessions.id, status: schema.sessions.status })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, ownedCourseId),
        isNull(schema.sessions.deletedAt),
      ),
    );

  if (openSessions.length === 0) {
    return { error: "Kurs hat noch keine Sessions." };
  }
  const incomplete = openSessions.filter((s) => s.status !== "completed");
  if (incomplete.length > 0) {
    return {
      error: `Noch ${incomplete.length} Session(s) nicht komplett signiert — Preview erst möglich, wenn alle bestätigt sind.`,
    };
  }

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
    return { error: "Kurs hat keine Teilnehmer." };
  }

  const failedEmails: string[] = [];
  let success = 0;
  for (const p of participants) {
    try {
      await sendParticipantPreviewInvite({
        courseId: ownedCourseId,
        participantId: p.participantId,
      });
      success++;
    } catch (err) {
      // Kein `p.email` in Logs — PII gehört in die Datenbank, nicht in
      // Log-Aggregatoren. Die E-Mail ist in `failedEmails` für die
      // UI-Rückmeldung (nur an den Coach, unter Auth) weiterhin sichtbar.
      console.error(
        `sendPreview failed for participant ${p.participantId} in course ${ownedCourseId}:`,
        err,
      );
      failedEmails.push(p.email);
    }
  }

  revalidatePath(`/coach/courses/${ownedCourseId}`);
  return {
    success,
    failedEmails: failedEmails.length > 0 ? failedEmails : undefined,
  };
}

export type SealState = { error?: string; sealed?: boolean } | undefined;

/**
 * Coach löst FES-Siegelung für den gesamten Kurs aus (CLAUDE.md Schritt 9-10,
 * aktuell gegen `src/lib/firma.ts` **gemockt**). Pre-Conditions:
 *   - Coach besitzt den Kurs, nicht unter Impersonation
 *   - Jede nicht-gelöschte Session ist `status = 'completed'`
 *   - JEDER enrollte Teilnehmer hat eine Freigabe in `participant_approvals`
 *   - Kurs noch nicht gesiegelt (`final_documents.fesStatus != 'completed'`)
 *
 * Speichert anschließend einen `final_documents`-Datensatz mit Envelope-ID
 * und setzt `fesStatus = 'completed'`. `afaStatus` bleibt `pending` — die
 * AfA-Übermittlung ist eine separate Aktion der Firma/Agency.
 *
 * Der PDF-URL zeigt für den Mock aktuell auf den bestehenden Per-TN-PDF-
 * Endpoint des ersten Teilnehmers, damit der "Download"-Link im Coach-UI
 * überhaupt was liefert. Real-Flow: Firma.dev liefert das gesiegelte PDF,
 * wir laden es in unser Storage und zeigen dessen URL.
 */
export async function sealCourse(
  _prev: SealState,
  formData: FormData,
): Promise<SealState> {
  const session = await requireCoach();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { error: "Kurs fehlt." };

  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  // Vor-Checks laufen unter dem UNIQUE(course_id)-Constraint und einer
  // Insert-bzw.-Update-mit-WHERE-Strategie atomar — zwei gleichzeitige
  // Klicks auf „Siegeln" dürfen die externe FES-API nur einmal treffen.
  const [existingDoc] = await db
    .select({
      id: schema.finalDocuments.id,
      fesStatus: schema.finalDocuments.fesStatus,
    })
    .from(schema.finalDocuments)
    .where(eq(schema.finalDocuments.courseId, ownedCourseId))
    .limit(1);
  if (existingDoc?.fesStatus === "completed") {
    return { error: "Kurs ist bereits mit FES gesiegelt." };
  }
  if (existingDoc?.fesStatus === "sent") {
    return { error: "Siegelung läuft bereits — bitte warten." };
  }

  // Sessions-Gate: jede nicht-gelöschte Session muss vollständig signiert sein.
  const allSessions = await db
    .select({ id: schema.sessions.id, status: schema.sessions.status })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, ownedCourseId),
        isNull(schema.sessions.deletedAt),
      ),
    );
  if (allSessions.length === 0) {
    return { error: "Kurs hat keine Sessions — nichts zu siegeln." };
  }
  if (allSessions.some((s) => s.status !== "completed")) {
    return {
      error: "Mindestens eine Session ist noch nicht vollständig signiert.",
    };
  }

  // Approval-Gate: jeder enrollte Teilnehmer muss freigegeben haben.
  const enrolled = await db
    .select({ participantId: schema.courseParticipants.participantId })
    .from(schema.courseParticipants)
    .where(eq(schema.courseParticipants.courseId, ownedCourseId));

  if (enrolled.length === 0) {
    return { error: "Kurs hat keine Teilnehmer." };
  }

  const approvals = await db
    .select({ participantId: schema.participantApprovals.participantId })
    .from(schema.participantApprovals)
    .where(eq(schema.participantApprovals.courseId, ownedCourseId));
  const approvedSet = new Set(approvals.map((a) => a.participantId));
  const missing = enrolled.filter((e) => !approvedSet.has(e.participantId));
  if (missing.length > 0) {
    return {
      error: `Noch ${missing.length} Teilnehmer haben nicht freigegeben — Siegel erst möglich, wenn alle zugestimmt haben.`,
    };
  }

  // Coach-Daten für den Envelope-Body ziehen.
  const [coach] = await db
    .select({
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.users)
    .where(eq(schema.users.id, coachId))
    .limit(1);
  const [course] = await db
    .select({ title: schema.courses.title })
    .from(schema.courses)
    .where(eq(schema.courses.id, ownedCourseId))
    .limit(1);
  if (!coach || !course) return { error: "Kurs- oder Coach-Daten fehlen." };

  // Mock-URL: zeigt auf den bestehenden Per-TN-PDF-Endpoint des ersten TN,
  // damit der Coach aus dem UI heraus einen sinnvollen Download-Klick hat.
  // Real-Flow (TODO): PDF rendern → Firma.dev hochladen → signed-PDF
  // herunterladen → eigenen Storage + URL.
  const firstParticipantId = enrolled[0]!.participantId;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const pdfUrl = `${base}/api/courses/${ownedCourseId}/participants/${firstParticipantId}/pdf`;

  // Slot-Reservierung BEVOR der externe FES-Call läuft: atomar auf
  // fes_status='sent' setzen (bzw. insert falls noch keine Row da).
  // Wenn rowCount=0, hat ein paralleler Call uns zuvorgekommen →
  // sofort bail, KEIN FES-Call abgesetzt.
  const reservedId = await db.transaction(async (tx) => {
    if (existingDoc) {
      const updated = await tx
        .update(schema.finalDocuments)
        .set({ fesStatus: "sent", pdfUrl, sealedBy: coachId })
        .where(
          and(
            eq(schema.finalDocuments.id, existingDoc.id),
            eq(schema.finalDocuments.fesStatus, "pending"),
          ),
        )
        .returning({ id: schema.finalDocuments.id });
      return updated[0]?.id ?? null;
    }
    // ON CONFLICT DO NOTHING auf UNIQUE(course_id) verhindert, dass zwei
    // parallele Inserts für denselben Kurs gleichzeitig durchgehen.
    const inserted = await tx
      .insert(schema.finalDocuments)
      .values({
        courseId: ownedCourseId,
        pdfUrl,
        sealedBy: coachId,
        fesStatus: "sent",
      })
      .onConflictDoNothing({ target: schema.finalDocuments.courseId })
      .returning({ id: schema.finalDocuments.id });
    return inserted[0]?.id ?? null;
  });

  if (!reservedId) {
    return {
      error: "Siegelung läuft bereits oder wurde soeben abgeschlossen.",
    };
  }

  let envelopeId: string;
  let signedPdfUrl: string;
  try {
    const seal = await sealWithFes({
      pdfUrl,
      signerName: coach.name,
      signerEmail: coach.email,
      courseTitle: course.title,
    });
    envelopeId = seal.envelopeId;
    // Gesiegelte URL als finalen Artefakt-Link persistieren — im Mock
    // unterscheidet sie sich vom Input-PDF nur durch `?sealed=<env>`,
    // im Live-Modus wäre es der Firma.dev-Signed-PDF-Link bzw. der
    // Storage-Link nach Download.
    signedPdfUrl = seal.signedPdfUrl;
  } catch (err) {
    console.error("firma.dev seal failed:", err);
    // Reservierung zurückdrehen, damit ein erneuter Klick einen neuen
    // Versuch machen kann statt im „sent"-Limbo festzuhängen.
    await db
      .update(schema.finalDocuments)
      .set({ fesStatus: "pending" })
      .where(eq(schema.finalDocuments.id, reservedId));
    return { error: "Siegelung fehlgeschlagen — bitte erneut versuchen." };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.finalDocuments)
      .set({
        pdfUrl: signedPdfUrl,
        firmaEnvelopeId: envelopeId,
        fesStatus: "completed",
        completedAt: now,
      })
      .where(eq(schema.finalDocuments.id, reservedId));

    await logAudit(
      {
        actorType: "coach",
        actorId: coachId,
        action: "course.seal",
        resourceType: "course",
        resourceId: ownedCourseId,
        metadata: { envelopeId, mock: process.env.FIRMA_DEV_MODE !== "live" },
      },
      tx,
    );
  });

  revalidatePath(`/coach/courses/${ownedCourseId}`);
  return { sealed: true };
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
  await autoNotifyAllParticipants(ownedCourseId);

  revalidatePath(`/coach/courses/${ownedCourseId}`);
  return undefined;
}

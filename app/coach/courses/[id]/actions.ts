"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, asc, eq, isNotNull, isNull, ne } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { getFeiertag } from "@/lib/feiertage";
import { sendReviewRequestedToBildungstraeger } from "@/lib/email";
import {
  parseEignungsanalyseFromForm,
  type Eignungsanalyse,
} from "@/lib/eignung";
import { isFutureSessionDate } from "@/lib/dates";
import {
  assertNotImpersonating,
  getTenantId,
  requireSigningEnabled,
} from "@/lib/dal";
import { sealWithFes } from "@/lib/firma";
import {
  coachCanAccessCourse,
  courseVisibleToCoach,
} from "@/lib/course-access";
import {
  sendParticipantInvite,
  sendParticipantPreviewInvite,
} from "@/lib/participant-tokens";
import { resetFesGates } from "@/lib/fes-gates";
import { recomputeSessionStatus } from "@/lib/session-status";
import { isValidE164, normalizePhoneInput } from "@/lib/sms";

export type SessionFormState = { error?: string } | undefined;

/**
 * Gemeinsame Feld-Validierung für Create + Update einer Session — beide
 * teilen exakt dieselben Regeln (Datum, Topic, Modus, UE, Erstgespräch-
 * Konsistenz). Liefert entweder einen normalisierten Datensatz oder eine
 * Fehlermeldung für die Server-Action.
 */
function validateSessionFormFields(formData: FormData):
  | {
      ok: true;
      values: {
        sessionDate: string;
        topic: string;
        modus: "praesenz" | "online";
        anzahlUe: string;
        isErstgespraech: boolean;
        geeignet: boolean | null;
        eignungsanalyse: Eignungsanalyse | null;
      };
    }
  | { ok: false; error: string } {
  const sessionDate = String(formData.get("sessionDate") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();
  const modus = String(formData.get("modus") ?? "").trim();
  const isErstgespraech = formData.get("isErstgespraech") === "on";
  const anzahlUeRaw = String(formData.get("anzahlUe") ?? "").trim();
  const geeignetRaw = String(formData.get("geeignet") ?? "").trim();

  if (!sessionDate) return { ok: false, error: "Datum fehlt." };
  if (!topic) return { ok: false, error: "Themen / Inhalte fehlen." };
  if (modus !== "praesenz" && modus !== "online") {
    return { ok: false, error: "Modus muss Präsenz oder Online sein." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return { ok: false, error: "Datum muss im Format JJJJ-MM-TT vorliegen." };
  }
  const [y, m, d] = sessionDate.split("-").map((s) => Number.parseInt(s, 10));
  const parsed = new Date(Date.UTC(y, m - 1, d));
  const isValidDate =
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d;
  if (!isValidDate) {
    return { ok: false, error: "Ungültiges Datum (Monat/Tag existiert nicht)." };
  }
  const weekday = parsed.getUTCDay();
  if (weekday === 0) {
    return {
      ok: false,
      error: "An Sonntagen können keine Coachings stattfinden.",
    };
  }

  let anzahlUe: string;
  let geeignet: boolean | null;
  let eignungsanalyse: Eignungsanalyse | null;
  if (isErstgespraech) {
    anzahlUe = "0";
    if (geeignetRaw !== "ja" && geeignetRaw !== "nein") {
      return {
        ok: false,
        error:
          "Beim Erstgespräch muss das Ergebnis der Eignungsanalyse (geeignet Ja/Nein) gesetzt sein.",
      };
    }
    geeignet = geeignetRaw === "ja";
    const eignung = parseEignungsanalyseFromForm(formData);
    if (!eignung.ok) {
      return {
        ok: false,
        error: `Bitte alle Kriterien der Eignungsanalyse bewerten (fehlt: ${eignung.missingLabel}).`,
      };
    }
    eignungsanalyse = eignung.value;
  } else {
    const ue = Number.parseFloat(anzahlUeRaw.replace(",", "."));
    if (!Number.isFinite(ue) || ue <= 0) {
      return { ok: false, error: "UE muss eine positive Zahl sein." };
    }
    if (Math.round(ue * 2) !== ue * 2) {
      return { ok: false, error: "UE muss in 0,5er-Schritten angegeben werden." };
    }
    if (ue > 24) {
      return { ok: false, error: "Eine Session darf 24 UE nicht überschreiten." };
    }
    anzahlUe = ue.toFixed(1);
    geeignet = null;
    eignungsanalyse = null;
  }

  return {
    ok: true,
    values: {
      sessionDate,
      topic,
      modus,
      anzahlUe,
      isErstgespraech,
      geeignet,
      eignungsanalyse,
    },
  };
}

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
  // 1:1: Der Kurs hat genau einen Kunden.
  const [course] = await db
    .select({ participantId: schema.courses.participantId })
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .limit(1);
  if (!course) return;

  try {
    await sendParticipantInvite({
      courseId,
      participantId: course.participantId,
    });
  } catch (err) {
    // Mailversand-Fehler dürfen die Coach-Signatur nicht blockieren —
    // der Coach kann über "Teilnehmer benachrichtigen" manuell nachlegen.
    console.error(
      `auto-notify failed for participant ${course.participantId}:`,
      err,
    );
  }
}

/**
 * Schickt allen aktiven Bildungsträger-Usern im Mandanten des Coaches eine
 * Mail „Neue Anwesenheitsliste zu prüfen". Best-effort — der Dashboard-Badge
 * greift auch ohne Mail, deshalb darf ein Fehler hier die Einreichung nicht
 * kippen (Caller fängt). Tenant des Coaches via `users.tenantId`.
 */
async function notifyBildungstraegerReviewRequested(params: {
  courseId: string;
  courseTitle: string;
  coachId: string;
}): Promise<void> {
  const [coach] = await db
    .select({ name: schema.users.name, tenantId: schema.users.tenantId })
    .from(schema.users)
    .where(eq(schema.users.id, params.coachId))
    .limit(1);
  if (!coach) return;

  const recipients = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "bildungstraeger"),
        eq(schema.users.tenantId, coach.tenantId),
        isNull(schema.users.deletedAt),
      ),
    );

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const url = `${base}/bildungstraeger/reviews/${params.courseId}`;
  for (const r of recipients) {
    await sendReviewRequestedToBildungstraeger({
      to: r.email,
      coachName: coach.name,
      courseTitle: params.courseTitle,
      url,
    });
  }
}

/**
 * Kompetenzteam-Gate für schreibende Coach-Aktionen: gibt die Kurs-ID zurück,
 * wenn der Coach Mitglied des Kompetenzteams ist (Lead ODER zugewiesen), sonst
 * null. Jeder Team-Coach darf alle Schritte auslösen (kein Lead-Sonderrecht);
 * nur das Signieren ist termin-gebunden (siehe `signSessionAsCoach`).
 */
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
        isNull(schema.courses.deletedAt),
        courseVisibleToCoach(coachId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Kursübergreifende Termin-Regeln, die `validateSessionFormFields` (rein,
 * feldbasiert) nicht prüfen kann, weil sie andere Sessions / Kursdaten brauchen:
 *
 *  - #4: Pro Maßnahme ist nur **ein** Erstgespräch erlaubt.
 *  - #5: Die **erste reguläre UE** (chronologisch früheste Nicht-Erstgespräch-
 *        Session) muss an einem Wochentag (Mo–Fr) liegen und darf kein
 *        gesetzlicher Feiertag (im Bundesland des Kunden) sein. Spätere UEs
 *        dürfen weiter samstags/an Feiertagen liegen (nur Warnung).
 *
 * `excludeSessionId` blendet beim Update die Session selbst aus, damit sie
 * nicht mit sich selbst kollidiert.
 */
async function validateCrossSessionRules(params: {
  courseId: string;
  sessionDate: string;
  isErstgespraech: boolean;
  excludeSessionId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // #4 — nur ein Erstgespräch je Maßnahme.
  if (params.isErstgespraech) {
    const [existing] = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.courseId, params.courseId),
          eq(schema.sessions.isErstgespraech, true),
          isNull(schema.sessions.deletedAt),
          ...(params.excludeSessionId
            ? [ne(schema.sessions.id, params.excludeSessionId)]
            : []),
        ),
      )
      .limit(1);
    if (existing) {
      return {
        ok: false,
        error:
          "Es gibt bereits ein Erstgespräch für diese Maßnahme — ein zweites ist nicht möglich.",
      };
    }
    // Erstgespräch zählt 0 UE → die Erste-UE-Regel (#5) gilt dafür nicht.
    return { ok: true };
  }

  // #5 — gilt nur für die chronologisch früheste reguläre UE.
  const others = await db
    .select({ sessionDate: schema.sessions.sessionDate })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, params.courseId),
        eq(schema.sessions.isErstgespraech, false),
        isNull(schema.sessions.deletedAt),
        ...(params.excludeSessionId
          ? [ne(schema.sessions.id, params.excludeSessionId)]
          : []),
      ),
    );
  // ISO-Datum (YYYY-MM-DD) ist lexikografisch = chronologisch sortierbar.
  const earliestOther = others.reduce<string | null>(
    (min, r) => (min === null || r.sessionDate < min ? r.sessionDate : min),
    null,
  );
  const istErsteUe =
    earliestOther === null || params.sessionDate <= earliestOther;
  if (!istErsteUe) return { ok: true };

  const [y, m, d] = params.sessionDate
    .split("-")
    .map((s) => Number.parseInt(s, 10));
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=So … 6=Sa
  if (weekday === 0 || weekday === 6) {
    return {
      ok: false,
      error:
        "Die erste UE der Maßnahme muss an einem Wochentag (Mo–Fr) liegen — Wochenende ist nur für spätere Termine erlaubt.",
    };
  }
  const [course] = await db
    .select({ bundesland: schema.courses.bundesland })
    .from(schema.courses)
    .where(eq(schema.courses.id, params.courseId))
    .limit(1);
  const feiertag = getFeiertag(params.sessionDate, course?.bundesland ?? null);
  if (feiertag) {
    return {
      ok: false,
      error: `Die erste UE der Maßnahme darf nicht auf einen Feiertag fallen (${feiertag}).`,
    };
  }
  return { ok: true };
}

export async function createSession(
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { error: "Kurs fehlt." };
  // requireOwnedCourseId stellt sicher, dass der Coach im Kompetenzteam ist.
  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  const validation = validateSessionFormFields(formData);
  if (!validation.ok) return { error: validation.error };
  const v = validation.values;

  const rules = await validateCrossSessionRules({
    courseId: ownedCourseId,
    sessionDate: v.sessionDate,
    isErstgespraech: v.isErstgespraech,
  });
  if (!rules.ok) return { error: rules.error };

  // 1:1: Der Termin gehört implizit dem einen Kunden des Kurses — keine
  // Teilnehmer-Auswahl pro Termin mehr.
  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.sessions)
        .values({
          courseId: ownedCourseId,
          // Self-Assign: ein Coach legt Termine nur für sich selbst an.
          coachId,
          sessionDate: v.sessionDate,
          topic: v.topic,
          modus: v.modus,
          anzahlUe: v.anzahlUe,
          isErstgespraech: v.isErstgespraech,
          geeignet: v.geeignet,
          eignungsanalyse: v.eignungsanalyse,
        })
        .returning({ id: schema.sessions.id });
      if (!created) throw new Error("INSERT_FAILED");
      // FES-Gates resetten: neuer Termin ändert den Stand → alte
      // Maßnahme-Abschluss-Bestätigung + ANW-Check-Status sind nicht
      // mehr aussagekräftig.
      await resetFesGates(tx, ownedCourseId);
      // #1: TN-Freigabe verwerfen. Ein neuer Termin ändert das Dokument →
      // eine bereits erteilte Freigabe bezeugt einen Stand, den es nicht
      // mehr gibt. Ohne das landet der TN beim Öffnen des Magic-Links auf
      // dem „Vorgang abgeschlossen"-Screen und kann den neuen Termin nicht
      // signieren. (Analog zu reopenSession.)
      await tx
        .delete(schema.participantApprovals)
        .where(eq(schema.participantApprovals.courseId, ownedCourseId));
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Termin konnte nicht angelegt werden (${message}).` };
  }

  redirect(`/coach/courses/${ownedCourseId}`);
}

/**
 * Aktualisiert eine bestehende Session. Erlaubt nur solange weder Coach
 * noch ein TN signiert hat — sobald eine Signatur dranhängt, würde die
 * Änderung den Audit-Trail (signed_at, IP) und die rechtliche Beweiskraft
 * der Signatur entwerten. Edit nach Sign muss über eine separate „Session
 * wieder öffnen"-Action gehen (eigene Migration, nicht in dieser V1).
 */
export async function updateSession(
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!courseId || !sessionId) return { error: "Kurs oder Session fehlt." };

  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  // Pre-Check: gehört die Session zu diesem Kurs UND ist sie noch
  // unsigniert? Wenn schon mindestens 1 Signatur existiert: hart blocken,
  // weil ein Edit den Audit-Trail (signed_at, IP, Inhalts-Snapshot) gegen
  // die Beweiskraft entwerten würde.
  const [sess] = await db
    .select({ id: schema.sessions.id, status: schema.sessions.status })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.id, sessionId),
        eq(schema.sessions.courseId, ownedCourseId),
        isNull(schema.sessions.deletedAt),
      ),
    )
    .limit(1);
  if (!sess) return { error: "Session nicht gefunden." };

  const [existingSig] = await db
    .select({ id: schema.signatures.id })
    .from(schema.signatures)
    .where(eq(schema.signatures.sessionId, sessionId))
    .limit(1);
  if (existingSig) {
    return {
      error:
        "Diese Session ist bereits signiert und lässt sich so nicht mehr bearbeiten. Um zu korrigieren, muss die Session erst wieder geöffnet werden (Coach- und TN-Signaturen werden dabei entfernt).",
    };
  }

  const validation = validateSessionFormFields(formData);
  if (!validation.ok) return { error: validation.error };
  const v = validation.values;

  const rules = await validateCrossSessionRules({
    courseId: ownedCourseId,
    sessionDate: v.sessionDate,
    isErstgespraech: v.isErstgespraech,
    excludeSessionId: sessionId,
  });
  if (!rules.ok) return { error: rules.error };

  try {
    await db.transaction(async (tx) => {
      // Der zugewiesene Coach (coach_id) bleibt unverändert — ein Coach legt
      // Termine nur für sich an, eine Fremd-Zuweisung gibt es nicht.
      await tx
        .update(schema.sessions)
        .set({
          sessionDate: v.sessionDate,
          topic: v.topic,
          modus: v.modus,
          anzahlUe: v.anzahlUe,
          isErstgespraech: v.isErstgespraech,
          geeignet: v.geeignet,
          eignungsanalyse: v.eignungsanalyse,
        })
        .where(eq(schema.sessions.id, sessionId));
      // FES-Gates resetten — Inhalts-Edit ändert den Stand.
      await resetFesGates(tx, ownedCourseId);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Termin konnte nicht aktualisiert werden (${message}).` };
  }

  redirect(`/coach/courses/${ownedCourseId}`);
}

export type ReopenSessionState = { error?: string; success?: boolean } | undefined;

/**
 * Öffnet eine bereits signierte Session wieder zur Bearbeitung. Hart-Reset:
 *   - alle Signaturen dieser Session werden gelöscht (Coach + alle TN)
 *   - alle Teilnehmer-Approvals dieses Kurses werden gelöscht (das
 *     freigegebene Dokument existiert nach dem Edit nicht mehr in der Form,
 *     also muss die Freigabe neu eingeholt werden)
 *   - Session-Status zurück auf `pending`
 *
 * Geblockt wenn der Kurs bereits versiegelt ist (FES dranhängt) — dann
 * darf rechtlich nichts mehr verändert werden, weil die FES bestätigt
 * genau diesen Stand. Mit FES heißt: neuer Kurs anlegen.
 */
export async function reopenSession(
  _prev: ReopenSessionState,
  formData: FormData,
): Promise<ReopenSessionState> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!courseId || !sessionId) return { error: "Kurs oder Session fehlt." };

  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  // FES-Gate: ein versiegelter Kurs ist rechtlich unveränderbar. Sonst
  // würde das gesiegelte PDF einen Stand bezeugen, den die DB nicht mehr
  // hat.
  const [doc] = await db
    .select({ fesStatus: schema.finalDocuments.fesStatus })
    .from(schema.finalDocuments)
    .where(eq(schema.finalDocuments.courseId, ownedCourseId))
    .limit(1);
  if (doc && (doc.fesStatus === "sent" || doc.fesStatus === "completed")) {
    return {
      error:
        "Dieser Kunde ist bereits mit FES versiegelt und kann rechtlich nicht mehr verändert werden. Für eine neue Maßnahme bitte den Bildungsträger einen neuen Kunden anlegen lassen.",
    };
  }

  const [sess] = await db
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
  if (!sess) return { error: "Session nicht gefunden." };

  // Guard: keine Signatur → Edit reicht, nicht Reopen. Sonst würden wir
  // unnötig die Kurs-TN-Approvals löschen, obwohl noch nichts signiert
  // war. Schickt den Coach direkt aufs Edit-Form.
  const [existingSig] = await db
    .select({ id: schema.signatures.id })
    .from(schema.signatures)
    .where(eq(schema.signatures.sessionId, sessionId))
    .limit(1);
  if (!existingSig) {
    redirect(
      `/coach/courses/${ownedCourseId}/sessions/${sessionId}/edit?reopened=1`,
    );
  }

  try {
    await db.transaction(async (tx) => {
      // 1. Alle Signaturen dieser Session weg
      await tx
        .delete(schema.signatures)
        .where(eq(schema.signatures.sessionId, sessionId));
      // 2. Status zurück auf pending
      await tx
        .update(schema.sessions)
        .set({ status: "pending" })
        .where(eq(schema.sessions.id, sessionId));
      // 3. Alle TN-Approvals dieses Kurses weg — das Dokument hat sich
      //    geändert, eine alte Freigabe wäre nicht mehr aussagekräftig.
      await tx
        .delete(schema.participantApprovals)
        .where(eq(schema.participantApprovals.courseId, ownedCourseId));
      // 4. FES-Gates resetten — Maßnahme-Abschluss und ANW-Check müssen
      //    nach dem Edit neu bestätigt werden.
      await resetFesGates(tx, ownedCourseId);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Wiederöffnen fehlgeschlagen (${message}).` };
  }

  revalidatePath(`/coach/courses/${ownedCourseId}`);
  // Direkt ins Edit-Form schicken — der User klickt „Wieder öffnen"
  // praktisch immer weil er den Inhalt korrigieren will. Zwei Klicks
  // (reopen → manuell Bearbeiten) ergeben keinen Mehrwert.
  redirect(
    `/coach/courses/${ownedCourseId}/sessions/${sessionId}/edit?reopened=1`,
  );
}

export type CorrectTopicState = { error?: string; success?: boolean } | undefined;

/**
 * „Inhalt korrigieren": ändert NUR den Themen-/ANW-Text eines Termins —
 * **ohne** die Signaturen zurückzusetzen und **ohne** die Teilnehmer-Freigabe
 * zu verwerfen (User-Entscheidung 2026-06-19). Begründung: Die Unterschrift
 * des Kunden bezeugt die **Anwesenheit am Datum**, nicht den exakten Wortlaut
 * der Themen-Beschreibung; eine AZAV-Konkretisierung der Formulierung ändert
 * die bezeugte Tatsache nicht. Der Edit wird audit-geloggt.
 *
 * Da sich der INHALT ändert, werden die inhaltsabhängigen Compliance-Gates
 * zurückgesetzt — ANW-Check (`anwCheckPassedAt`) und Bildungsträger-Prüfung
 * (`reviewStatus`) müssen neu laufen. `abgeschlossenAt`, Signaturen und
 * Freigaben bleiben erhalten. Datum/UE/Erstgespräch/Eignung sind hier NICHT
 * änderbar — die hängen an der Signatur und gehen weiter über „Bearbeiten
 * (Signaturen zurücksetzen)".
 */
export async function correctSessionTopic(
  _prev: CorrectTopicState,
  formData: FormData,
): Promise<CorrectTopicState> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();
  if (!courseId || !sessionId) return { error: "Kurs oder Termin fehlt." };
  if (!topic) return { error: "Themen / Inhalte dürfen nicht leer sein." };

  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  // Versiegelter Kurs ist rechtlich unveränderbar — wie beim Reopen.
  const [doc] = await db
    .select({ fesStatus: schema.finalDocuments.fesStatus })
    .from(schema.finalDocuments)
    .where(eq(schema.finalDocuments.courseId, ownedCourseId))
    .limit(1);
  if (doc && (doc.fesStatus === "sent" || doc.fesStatus === "completed")) {
    return {
      error:
        "Dieser Kunde ist bereits mit FES versiegelt und kann rechtlich nicht mehr verändert werden.",
    };
  }

  const [sess] = await db
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
  if (!sess) return { error: "Termin nicht gefunden." };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.sessions)
        .set({ topic })
        .where(eq(schema.sessions.id, sessionId));
      // Inhaltsabhängige Gates zurücksetzen (Maßnahme-Abschluss, Signaturen
      // und Freigaben bleiben — nur der Themen-Text ändert sich).
      await resetFesGates(tx, ownedCourseId, { keepAbgeschlossen: true });
      await logAudit(
        {
          actorType: "coach",
          actorId: coachId,
          action: "session.topic_corrected",
          resourceType: "session",
          resourceId: sessionId,
          metadata: { courseId: ownedCourseId },
        },
        tx,
      );
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Korrektur fehlgeschlagen (${message}).` };
  }

  revalidatePath(`/coach/courses/${ownedCourseId}`);
  return { success: true };
}

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// 1:1-Modell: `addParticipant` ist entfallen — der eine Kunde wird bei der
// Anlage (durch den Bildungsträger) gesetzt, nicht nachträglich eingeschrieben.
// Stammdaten-Korrekturen laufen über `updateParticipant`.

export type UpdateParticipantState = { error?: string } | undefined;

/**
 * Update der TN-Stammdaten (Name, Email, Kunden-Nr., Phone). Coach muss
 * den Kurs besitzen, kein Impersonation. Der TN ist im 1:1-Modell über
 * `courses.participant_id` an den Kurs gebunden — wir prüfen die Paarung,
 * bevor der zentrale `participants`-Datensatz angefasst wird, sonst könnte
 * ein Coach durch URL-Manipulation an einen TN ran, den er gar nicht betreut.
 *
 * Email-Wechsel ist erlaubt — `participantId` bleibt stabil, aktive Magic-
 * Link-Tokens hängen nicht an der Mail. Bei Konflikt mit existierender
 * Email im selben Tenant (tenant-scoped UNIQUE) wirft DB und wir geben
 * eine saubere Fehlermeldung zurück.
 *
 * Beachtung: Derselbe Mensch (gleiche E-Mail) kann Kunde mehrerer Maßnahmen
 * im selben Tenant sein und teilt sich den `participants`-Stammdatensatz.
 * Eine Stammdaten-Änderung wirkt damit auf ALLE seine Kurse — das ist
 * gewollt (Stammdaten sind eben Stamm).
 */
export async function updateParticipant(
  _prev: UpdateParticipantState,
  formData: FormData,
): Promise<UpdateParticipantState> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;
  const tenantId = getTenantId(session);

  const courseId = String(formData.get("courseId") ?? "").trim();
  const participantId = String(formData.get("participantId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const kundenNr = String(formData.get("kundenNr") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  if (!courseId || !participantId) {
    return { error: "Kurs oder Teilnehmer fehlt." };
  }
  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  if (!name || !email || !kundenNr) {
    return { error: "Name, E-Mail und Kunden-Nr. sind Pflicht." };
  }
  if (!looksLikeEmail(email)) {
    return { error: "Ungültige E-Mail-Adresse." };
  }

  // Phone optional + E.164 erzwingen wenn gesetzt — selbe Logik wie in
  // addParticipant, hier aber explizit gegen leeren String zu NULL
  // unterscheiden, damit Coach eine Nummer auch wieder entfernen kann.
  let phone: string | null = null;
  if (phoneRaw.length > 0) {
    const normalized = normalizePhoneInput(phoneRaw);
    if (!isValidE164(normalized)) {
      return {
        error:
          "Mobilnummer ist ungültig — bitte im Format +4915712345678 eingeben (oder Feld leer lassen).",
      };
    }
    phone = normalized;
  }

  // 1:1: Der TN muss der Kunde genau dieses Kurses sein — verhindert, dass ein
  // Coach einen TN aus einem fremden Kurs ändert. tenant_id filtert zusätzlich
  // gegen Cross-Tenant-Zugriffe (Defense-in-Depth).
  const [enrollment] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(
      and(
        eq(schema.courses.id, ownedCourseId),
        eq(schema.courses.participantId, participantId),
        eq(schema.participants.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!enrollment) {
    return { error: "Teilnehmer ist nicht in diesem Kurs." };
  }

  try {
    await db
      .update(schema.participants)
      .set({ name, email, kundenNr, phone })
      .where(eq(schema.participants.id, participantId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Unique-Verletzung auf (tenant_id, email) — Coach hat versucht
    // die Email auf eine im selben Tenant bereits genutzte zu setzen.
    if (/unique/i.test(message) || /duplicate/i.test(message)) {
      return {
        error:
          "Diese E-Mail-Adresse ist im Bildungsträger bereits einem anderen Teilnehmer zugeordnet.",
      };
    }
    return { error: `Aktualisierung fehlgeschlagen (${message}).` };
  }

  redirect(`/coach/courses/${ownedCourseId}`);
}

/**
 * QR-Code-Übergabe: erzeugt einen frischen Magic-Link für den TN und
 * gibt ihn samt PNG-Data-URL für den QR-Code zurück. Der Coach zeigt
 * den QR direkt auf seinem Bildschirm, TN scannt mit der Handy-Kamera.
 *
 * Semantisch wie ein Notify-Click: alte Tokens für diese (Kurs, TN)-
 * Paarung werden invalidiert. UI informiert den Coach darüber.
 *
 * Bewusst KEIN Form-Action mit useActionState — wird per direktem
 * Async-Call aus dem Client gerufen, weil das Modal-Open-Event kein
 * Submit ist und Form-State unnötigen Overhead bedeuten würde.
 */
export async function createParticipantQrLink(params: {
  courseId: string;
  participantId: string;
}): Promise<
  | { url: string; qrDataUrl: string; error?: undefined }
  | { error: string; url?: undefined; qrDataUrl?: undefined }
> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;
  const tenantId = getTenantId(session);

  const ownedCourseId = await requireOwnedCourseId(params.courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  const [enrollment] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(
      and(
        eq(schema.courses.id, ownedCourseId),
        eq(schema.courses.participantId, params.participantId),
        eq(schema.participants.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!enrollment) return { error: "Teilnehmer nicht in diesem Kurs." };

  // Dynamic import — qrcode-Lib wird sonst in jeden Action-Bundle gezogen,
  // obwohl nur dieser eine Code-Pfad sie braucht.
  const [{ createParticipantMagicLink }, QRCode] = await Promise.all([
    import("@/lib/participant-tokens"),
    import("qrcode"),
  ]);

  const { url } = await createParticipantMagicLink({
    courseId: ownedCourseId,
    participantId: params.participantId,
  });

  // PNG-Data-URL statt SVG: PNG ist binary → kein XSS-Risiko durch
  // dangerouslySetInnerHTML notwendig, einfaches <img src={…}> reicht.
  // 320px Breite ist groß genug für scharfe Scans aus ~30 cm Entfernung
  // auf üblichen Coach-Bildschirmen.
  const qrDataUrl = await QRCode.toDataURL(url, {
    margin: 1,
    width: 320,
    errorCorrectionLevel: "M",
  });

  return { url, qrDataUrl };
}

export type NotifyState =
  | {
      success?: number;
      failedEmails?: string[];
      error?: string;
    }
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
  const session = await requireSigningEnabled();
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
    .from(schema.courses)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(eq(schema.courses.id, ownedCourseId));

  if (participants.length === 0) {
    return { error: "Kurs hat noch keinen Kunden." };
  }

  const failedEmails: string[] = [];
  let success = 0;
  for (const p of participants) {
    try {
      // Bulk-Notify ist hart auf Email verkabelt — SMS ist KEIN Bulk-Channel,
      // sondern ausschließlich Coach-getriggerte Per-TN-Aktion über
      // `resendInviteAsSms` (siehe unten). Damit bleiben die Kosten unter
      // Kontrolle und der Coach hat die volle Entscheidungsgewalt.
      await sendParticipantInvite({
        courseId: ownedCourseId,
        participantId: p.participantId,
        channel: "email",
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

export type SmsResendState = { error?: string; success?: boolean } | undefined;

/**
 * Verschickt einen frischen Magic-Link per SMS an EINEN spezifischen TN.
 * Bewusst getrennt vom Bulk-Notify, weil SMS pro Versand 7,5 Cent kostet
 * und vom Coach nur als gezielte Reaktion auf einen TN gedacht ist, der
 * auf die E-Mail nicht reagiert hat.
 *
 * Gate-Reihenfolge identisch zu `notifyParticipants`:
 *   1. Signing-enabled-Flag des Coaches
 *   2. Nicht unter Impersonation
 *   3. Kurs gehört dem Coach
 *   4. TN ist im Kurs eingeschrieben (über sendParticipantInvite)
 *   5. SMS_ENABLED + Phone (über `effectiveChannel` im Lib-Layer)
 *
 * Wenn das Lib-Layer Email-Fallback auslöst (kein SMS_ENABLED oder kein
 * Phone), werfen wir hart — sonst denkt der Coach er hätte eine SMS
 * geschickt, der TN bekommt aber unsichtbar nochmal die Mail die schon
 * im Spam liegt.
 */
export async function resendInviteAsSms(
  _prev: SmsResendState,
  formData: FormData,
): Promise<SmsResendState> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const participantId = String(formData.get("participantId") ?? "").trim();
  if (!courseId || !participantId) {
    return { error: "Kurs oder Teilnehmer fehlt." };
  }

  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  try {
    const { usedChannel } = await sendParticipantInvite({
      courseId: ownedCourseId,
      participantId,
      channel: "sms",
    });
    if (usedChannel !== "sms") {
      // Lib-Layer hat auf Email umgeleitet (Flag aus oder Phone fehlt).
      // Für diese Action ist das ein Fehlerfall, kein Silent-Fallback.
      return {
        error:
          "SMS-Versand nicht möglich — entweder ist die Mobilnummer beim TN nicht hinterlegt oder das SMS-Feature ist nicht aktiv.",
      };
    }
  } catch (err) {
    console.error(
      `resendInviteAsSms failed for participant ${participantId}:`,
      err,
    );
    return {
      error:
        "SMS-Versand fehlgeschlagen. Bitte später erneut versuchen oder beim Support melden.",
    };
  }

  revalidatePath(`/coach/courses/${ownedCourseId}`);
  return { success: true };
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
  const session = await requireSigningEnabled();
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

  // Pflicht-Gates vor TN-Freigabe-Aufforderung: ANW-Check muss durch und
  // der Coach muss die Maßnahme aktiv als abgeschlossen markiert haben.
  // Sonst landet beim TN eine Freigabe-Aufforderung an die Agentur für
  // Arbeit, während der Coach gedanklich noch mitten im Kurs ist und
  // weitere Sessions plant.
  const [gates] = await db
    .select({
      anwCheckPassedAt: schema.courses.anwCheckPassedAt,
      abgeschlossenAt: schema.courses.abgeschlossenAt,
    })
    .from(schema.courses)
    .where(eq(schema.courses.id, ownedCourseId))
    .limit(1);
  if (!gates?.abgeschlossenAt) {
    return {
      error:
        "Vor dem Versand der Freigabe-Aufforderung muss die Maßnahme als abgeschlossen markiert werden (Schritt davor).",
    };
  }
  if (!gates.anwCheckPassedAt) {
    return {
      error:
        "Vor dem Versand der Freigabe-Aufforderung muss der ANW-Compliance-Check mit Status „Freigabe“ durchlaufen sein.",
    };
  }

  const participants = await db
    .select({
      participantId: schema.participants.id,
      email: schema.participants.email,
    })
    .from(schema.courses)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(eq(schema.courses.id, ownedCourseId));

  if (participants.length === 0) {
    return { error: "Kurs hat keinen Kunden." };
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

export type AnwCheckState =
  | {
      error?: string;
      result?: import("@/lib/checker/anw-check").AnwCheckResult;
    }
  | undefined;

/**
 * Server-Action für den ANW-Compliance-Check (KI-gestützte Prüfung der
 * Stichwort-Einträge im Stundennachweis). Bewusst stateless — kein
 * Persistieren des Ergebnisses, jeder Klick neuer Azure-Call. Memory
 * `project_checker_konkretheit` etabliert das Pattern für KI-Checks
 * im Signflow-Stack.
 */
export async function runAnwCheckAction(
  _prev: AnwCheckState,
  formData: FormData,
): Promise<AnwCheckState> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;
  const tenantId = getTenantId(session);

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { error: "Kurs fehlt." };

  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  // Tenant-Name + Kurs-Maßnahmentyp holen. `courses` hat keinen eigenen
  // `tenantId` — der Mandant wird über den Coach (users.tenantId) abgeleitet,
  // konsistent mit dem Multi-Tenant-Pattern an anderen Stellen.
  const [meta] = await db
    .select({
      massnahmeTyp: schema.courses.massnahmeTyp,
      tenantName: schema.tenants.name,
    })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.users.tenantId))
    .where(eq(schema.courses.id, ownedCourseId))
    .limit(1);
  if (!meta) return { error: "Kurs nicht auflösbar." };

  // Schon-mal-Verteidigung: nur Sessions des eigenen Tenants laden —
  // sollte durch das Course-Ownership bereits hart sein, aber explizit
  // ist besser als implizit.
  const entries = await db
    .select({
      sessionDate: schema.sessions.sessionDate,
      topic: schema.sessions.topic,
      anzahlUe: schema.sessions.anzahlUe,
      isErstgespraech: schema.sessions.isErstgespraech,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, ownedCourseId),
        isNull(schema.sessions.deletedAt),
      ),
    )
    .orderBy(asc(schema.sessions.sessionDate));

  try {
    const { runAnwCheck } = await import("@/lib/checker/anw-check");
    const result = await runAnwCheck({
      massnahmeTyp: meta.massnahmeTyp,
      tenantName: meta.tenantName,
      entries: entries.map((e) => ({
        sessionDate: e.sessionDate,
        topic: e.topic,
        anzahlUe: Number.parseFloat(e.anzahlUe),
        isErstgespraech: e.isErstgespraech,
      })),
    });
    // Server-Log für Audit-Zwecke (siehe Memory project_checker_konkretheit).
    // Tenant-ID statt -Name, weil ID stabiler ist.
    console.log(
      `anw-check: tenant=${tenantId} course=${ownedCourseId} status=${result.status} warnings=${result.warnings.length}`,
    );
    // FES-Gate: bei `freigabe` Timestamp setzen, sonst löschen. So bleibt
    // das Gate nicht auf einem alten „freigabe" stehen, wenn der Coach
    // nach einer Änderung den Check nochmal laufen lässt und er jetzt
    // „nacharbeit" sagt.
    await db
      .update(schema.courses)
      .set({
        anwCheckPassedAt: result.status === "freigabe" ? new Date() : null,
      })
      .where(eq(schema.courses.id, ownedCourseId));
    revalidatePath(`/coach/courses/${ownedCourseId}`);
    return { result };
  } catch (err) {
    console.error(
      `anw-check failed for course ${ownedCourseId}:`,
      err,
    );
    return {
      error:
        "ANW-Check fehlgeschlagen. Bitte später erneut versuchen oder den Support kontaktieren.",
    };
  }
}

export type AnwAcknowledgeState =
  | { error?: string; acknowledged?: boolean }
  | undefined;

/**
 * Acknowledge-Override für den ANW-Check: Der ANW-Check ist eine **nicht
 * rechtsverbindliche KI-Hilfestellung**. Liefert er „nacharbeit" (Soft-Flags),
 * darf der Coach die Hinweise bewusst quittieren und trotzdem fortfahren —
 * statt hart blockiert zu sein. Setzt `anwCheckPassedAt` (schaltet die
 * Folge-Schritte frei) und schreibt einen Audit-Eintrag, der den Override
 * dokumentiert. Die menschliche Compliance-Sicherung bleibt: der
 * Bildungsträger prüft die Liste anschließend ohnehin ([[BT-Prüfung]]).
 *
 * Wird bei jeder Session-Änderung — wie ein normaler Check — wieder
 * zurückgesetzt (anwCheckPassedAt: null), der Coach muss dann neu quittieren.
 */
export async function acknowledgeAnwCheckAction(
  _prev: AnwAcknowledgeState,
  formData: FormData,
): Promise<AnwAcknowledgeState> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { error: "Kurs fehlt." };
  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  const warningsCount =
    Number.parseInt(String(formData.get("warningsCount") ?? "0"), 10) || 0;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.courses)
        .set({ anwCheckPassedAt: new Date() })
        .where(eq(schema.courses.id, ownedCourseId));
      await logAudit(
        {
          actorType: "coach",
          actorId: coachId,
          action: "anw.soft_flags.acknowledged",
          resourceType: "course",
          resourceId: ownedCourseId,
          metadata: { warningsCount, override: true },
        },
        tx,
      );
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Freigabe fehlgeschlagen (${message}).` };
  }

  revalidatePath(`/coach/courses/${ownedCourseId}`);
  return { acknowledged: true };
}

export type MarkAbgeschlossenState =
  | { error?: string; success?: boolean }
  | undefined;

/**
 * Coach bestätigt: keine weiteren Sessions kommen. Erst nach diesem Klick
 * (und der anschließenden Teilnehmer-Freigabe + BT-Prüfung) darf FES-Sealing
 * laufen.
 *
 * Regel (vom Kunden festgelegt 2026-06-12): sind die bewilligten UE voll
 * geleistet, geht der Abschluss direkt durch. Liegt die geleistete UE-Zahl
 * DARUNTER (vorzeitiges Ende, inkl. 0 UE bei Sofort-Abbruch), ist eine
 * Begründung PFLICHT — sie wird auf dem Kurs gespeichert (`flagVorzeitigesEnde`
 * + `begruendungText`) und später dem Bildungsträger in der Prüfung angezeigt.
 *
 * Beim nächsten Session-Edit/Create/Reopen wird `abgeschlossenAt` wieder
 * gelöscht, der Coach muss neu bestätigen.
 */
export async function markCourseAbgeschlossen(
  _prev: MarkAbgeschlossenState,
  formData: FormData,
): Promise<MarkAbgeschlossenState> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { error: "Kurs fehlt." };
  const begruendung = String(formData.get("begruendung") ?? "").trim();

  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  // Gate-Berechnung serverseitig — Client-UI kann den Button zwar grayen,
  // aber die Wahrheit liegt hier.
  const [course] = await db
    .select({
      anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
    })
    .from(schema.courses)
    .where(eq(schema.courses.id, ownedCourseId))
    .limit(1);
  if (!course) return { error: "Kurs nicht auflösbar." };

  // Summe der geleisteten UE (nur completed Sessions zählen, Erstgespräche
  // wie im Sheet UE-frei).
  const completedSessions = await db
    .select({
      anzahlUe: schema.sessions.anzahlUe,
      isErstgespraech: schema.sessions.isErstgespraech,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, ownedCourseId),
        eq(schema.sessions.status, "completed"),
        isNull(schema.sessions.deletedAt),
      ),
    );
  const geleisteteUe = completedSessions
    .filter((s) => !s.isErstgespraech)
    .reduce((sum, s) => sum + Number.parseFloat(s.anzahlUe), 0);

  // Unvollständig = weniger geleistet als bewilligt → Begründung Pflicht.
  const istVollstaendig = geleisteteUe >= course.anzahlBewilligteUe;
  if (!istVollstaendig && begruendung.length === 0) {
    return {
      error: `Es sind erst ${geleisteteUe.toString().replace(".", ",")} von ${course.anzahlBewilligteUe} UE geleistet. Zum vorzeitigen Abschluss bitte eine Begründung angeben — sie wird dem Bildungsträger bei der Prüfung angezeigt.`,
    };
  }

  try {
    await db
      .update(schema.courses)
      .set({
        abgeschlossenAt: new Date(),
        // Bei vorzeitigem Ende Flag + Begründung mitsetzen (landen im
        // AfA-Footer + in der BT-Prüfung). Bei voller Erfüllung Flag aus.
        flagVorzeitigesEnde: !istVollstaendig,
        begruendungText: istVollstaendig ? null : begruendung,
      })
      .where(eq(schema.courses.id, ownedCourseId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Markierung fehlgeschlagen (${message}).` };
  }

  revalidatePath(`/coach/courses/${ownedCourseId}`);
  return { success: true };
}

export type RequestReviewState =
  | { error?: string; success?: boolean }
  | undefined;

/**
 * Coach reicht die fertige, vom Kunden freigegebene Anwesenheitsliste beim
 * Bildungsträger zur Prüfung ein (FES-Gate 3/3). Pre-Conditions sind dieselben
 * wie beim FES-Sealing — nur dass am Ende statt des Siegels die BT-Prüfung
 * angestoßen wird. Setzt `reviewStatus = 'pending'`, schreibt eine `submit`-
 * Notiz (inkl. Begründung bei vorzeitigem Ende) und benachrichtigt den BT.
 */
export async function requestBildungstraegerReview(
  _prev: RequestReviewState,
  formData: FormData,
): Promise<RequestReviewState> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { error: "Kurs fehlt." };
  const coachNote = String(formData.get("note") ?? "").trim();

  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  const [course] = await db
    .select({
      title: schema.courses.title,
      reviewStatus: schema.courses.reviewStatus,
      anwCheckPassedAt: schema.courses.anwCheckPassedAt,
      abgeschlossenAt: schema.courses.abgeschlossenAt,
      flagVorzeitigesEnde: schema.courses.flagVorzeitigesEnde,
      begruendungText: schema.courses.begruendungText,
      participantId: schema.courses.participantId,
    })
    .from(schema.courses)
    .where(eq(schema.courses.id, ownedCourseId))
    .limit(1);
  if (!course) return { error: "Kurs nicht auflösbar." };

  if (course.reviewStatus === "approved") {
    return { error: "Der Bildungsträger hat bereits freigegeben." };
  }
  if (course.reviewStatus === "pending") {
    return { error: "Die Prüfung läuft bereits — der Bildungsträger ist am Zug." };
  }
  if (!course.abgeschlossenAt) {
    return { error: "Maßnahme muss zuerst als abgeschlossen markiert werden." };
  }
  if (!course.anwCheckPassedAt) {
    return { error: "ANW-Compliance-Check muss zuerst durchlaufen sein." };
  }

  // Sessions-Gate: alle nicht-gelöschten Sessions vollständig signiert.
  const allSessions = await db
    .select({ status: schema.sessions.status })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, ownedCourseId),
        isNull(schema.sessions.deletedAt),
      ),
    );
  if (allSessions.length === 0) {
    return { error: "Kurs hat keine Sessions." };
  }
  if (allSessions.some((s) => s.status !== "completed")) {
    return { error: "Mindestens eine Session ist noch nicht vollständig signiert." };
  }

  // Approval-Gate (1:1): der eine Kunde muss freigegeben haben.
  const [approval] = await db
    .select({ id: schema.participantApprovals.id })
    .from(schema.participantApprovals)
    .where(
      and(
        eq(schema.participantApprovals.courseId, ownedCourseId),
        eq(schema.participantApprovals.participantId, course.participantId),
      ),
    )
    .limit(1);
  if (!approval) {
    return { error: "Der Kunde hat den Nachweis noch nicht freigegeben." };
  }

  // Submit-Notiz zusammenbauen: Begründung bei vorzeitigem Ende voranstellen,
  // optionale Coach-Notiz anhängen.
  const noteParts: string[] = [];
  if (course.flagVorzeitigesEnde && course.begruendungText?.trim()) {
    noteParts.push(`Vorzeitiges Ende — Begründung: ${course.begruendungText.trim()}`);
  }
  if (coachNote) noteParts.push(coachNote);
  const noteBody = noteParts.join("\n\n") || null;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.courses)
        .set({
          reviewStatus: "pending",
          reviewRequestedAt: new Date(),
          reviewDecidedAt: null,
          reviewDecidedBy: null,
        })
        .where(eq(schema.courses.id, ownedCourseId));
      await tx.insert(schema.courseReviewNotes).values({
        courseId: ownedCourseId,
        authorType: "coach",
        authorId: coachId,
        kind: "submit",
        body: noteBody,
      });
      await logAudit(
        {
          actorType: "coach",
          actorId: coachId,
          action: "course.review_requested",
          resourceType: "course",
          resourceId: ownedCourseId,
        },
        tx,
      );
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Einreichung fehlgeschlagen (${message}).` };
  }

  // Bildungsträger benachrichtigen (best effort — der Badge im Dashboard
  // greift auch ohne Mail). Fehler hier dürfen die Einreichung nicht kippen.
  try {
    await notifyBildungstraegerReviewRequested({
      courseId: ownedCourseId,
      courseTitle: course.title,
      coachId,
    });
  } catch (err) {
    console.error(`review-request notification failed for course ${ownedCourseId}:`, err);
  }

  revalidatePath(`/coach/courses/${ownedCourseId}`);
  return { success: true };
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
 * AfA-Übermittlung ist eine separate Aktion der Firma/Bildungsträger.
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
  const session = await requireSigningEnabled();
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

  // FES-Gates (zusätzlich zu Sessions/Approval): ANW-Check muss durch
  // und Coach muss „Maßnahme abgeschlossen" aktiv bestätigt haben. Beide
  // Gates werden bei jedem Session-Edit zurückgesetzt → der Coach kann
  // nicht versehentlich auf einem alten Stand siegeln.
  const [courseGates] = await db
    .select({
      anwCheckPassedAt: schema.courses.anwCheckPassedAt,
      abgeschlossenAt: schema.courses.abgeschlossenAt,
      reviewStatus: schema.courses.reviewStatus,
    })
    .from(schema.courses)
    .where(eq(schema.courses.id, ownedCourseId))
    .limit(1);
  if (!courseGates?.anwCheckPassedAt) {
    return {
      error:
        "ANW-Compliance-Check muss vor der Versiegelung mit Status „Freigabe“ durchlaufen sein.",
    };
  }
  if (!courseGates.abgeschlossenAt) {
    return {
      error:
        "Maßnahme muss vor der Versiegelung aktiv als abgeschlossen markiert werden.",
    };
  }
  // FES-Gate (3/3): Der Bildungsträger muss die Anwesenheitsliste geprüft und
  // freigegeben haben. Ohne diese Freigabe darf das Siegel nicht laufen.
  if (courseGates.reviewStatus !== "approved") {
    return {
      error:
        "Der Bildungsträger muss die Anwesenheitsliste vor der Versiegelung prüfen und freigeben.",
    };
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

  // Kompetenzteams-Invariante (Defense-in-Depth vor dem irreversiblen Siegel):
  // „alle Termine signiert" heißt „jeder Termin von SEINEM zugewiesenen Coach
  // signiert". Das harte Per-Termin-Gate in signSessionAsCoach garantiert das
  // bereits beim Signieren — hier wird es vor der FES nochmals explizit geprüft,
  // damit eine etwaige Alt-/Fremddaten-Inkonsistenz nicht ins gesiegelte PDF
  // gelangt. Geflaggt wird nur ein echter Mismatch (beide coach_id gesetzt und
  // verschieden); NULL-Fälle (un-gebackfillte Alt-Daten) lösen keine
  // False-Positives aus.
  const wrongCoach = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .innerJoin(
      schema.signatures,
      and(
        eq(schema.signatures.sessionId, schema.sessions.id),
        eq(schema.signatures.signerType, "coach"),
      ),
    )
    .where(
      and(
        eq(schema.sessions.courseId, ownedCourseId),
        isNull(schema.sessions.deletedAt),
        isNotNull(schema.sessions.coachId),
        isNotNull(schema.signatures.coachId),
        ne(schema.signatures.coachId, schema.sessions.coachId),
      ),
    )
    .limit(1);
  if (wrongCoach.length > 0) {
    return {
      error:
        "Mindestens ein Termin wurde nicht von seinem zugewiesenen Coach signiert — die Versiegelung ist blockiert. Bitte den betroffenen Termin wieder öffnen und vom zugewiesenen Coach neu signieren lassen.",
    };
  }

  // Approval-Gate (1:1): der eine Kunde muss freigegeben haben.
  const enrolled = await db
    .select({ participantId: schema.courses.participantId })
    .from(schema.courses)
    .where(eq(schema.courses.id, ownedCourseId));

  if (enrolled.length === 0) {
    return { error: "Kurs hat keinen Kunden." };
  }

  const approvals = await db
    .select({ participantId: schema.participantApprovals.participantId })
    .from(schema.participantApprovals)
    .where(eq(schema.participantApprovals.courseId, ownedCourseId));
  const approvedSet = new Set(approvals.map((a) => a.participantId));
  const missing = enrolled.filter((e) => !approvedSet.has(e.participantId));
  if (missing.length > 0) {
    return {
      error:
        "Der Kunde hat den Nachweis noch nicht freigegeben — Siegel erst danach möglich.",
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
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const confirmed = formData.get("confirm") === "on";
  if (!courseId || !sessionId) return { error: "Kurs oder Session fehlt." };
  if (!confirmed) return { error: "Bitte aktiv bestätigen." };

  // Kompetenzteams: nicht mehr Lead-only — auch ein zugewiesener Team-Coach
  // darf zugreifen. Welchen Termin er signieren darf, entscheidet das harte
  // Per-Termin-Gate weiter unten (session.coach_id == coachId).
  const canAccess = await coachCanAccessCourse(courseId, coachId);
  if (!canAccess) return { error: "Kurs nicht gefunden." };
  const ownedCourseId = courseId;

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
      // Termin muss zum Kurs gehören + noch nicht gelöscht sein.
      const [sess] = await tx
        .select({
          id: schema.sessions.id,
          sessionDate: schema.sessions.sessionDate,
          coachId: schema.sessions.coachId,
        })
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

      // Kompetenzteams — HARTES Per-Termin-Gate: ein Coach darf NUR Termine
      // signieren, die ihm zugewiesen sind. Sonst wäre die Beweiskraft kaputt
      // (Coach A könnte für Coach B signieren). Fallback für Alt-Termine ohne
      // Zuweisung (coach_id NULL, nicht gebackfillt): nur der Lead darf.
      if (sess.coachId !== coachId) {
        if (sess.coachId === null) {
          const [courseRow] = await tx
            .select({ leadCoachId: schema.courses.coachId })
            .from(schema.courses)
            .where(eq(schema.courses.id, ownedCourseId))
            .limit(1);
          if (courseRow?.leadCoachId !== coachId) {
            throw new Error("NOT_ASSIGNED");
          }
        } else {
          throw new Error("NOT_ASSIGNED");
        }
      }

      // Zukunfts-Termine sind nicht signierbar — Anwesenheit für etwas, das
      // noch nicht stattgefunden hat, wäre fachlich + rechtlich unsinnig.
      if (isFutureSessionDate(sess.sessionDate)) {
        throw new Error("FUTURE_SESSION");
      }

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
        participantId: null,
        // Kompetenzteams: durable festhalten, WER signiert hat (unabhängig von
        // späteren Zuweisungs-Änderungen — die nach Signatur ohnehin geblockt
        // sind, aber das Audit soll für sich stehen).
        coachId,
        signerType: "coach",
        signatureUrl: coachSignatureUrl,
        ipAddress,
      });

      await recomputeSessionStatus(sess.id, tx);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "SESSION_NOT_FOUND") {
      return { error: "Termin nicht gefunden." };
    }
    if (message === "NOT_ASSIGNED") {
      return {
        error:
          "Dieser Termin ist einem anderen Coach zugewiesen — nur der zugewiesene Coach kann ihn signieren.",
      };
    }
    if (message === "FUTURE_SESSION") {
      return {
        error:
          "Dieser Termin liegt in der Zukunft und kann erst ab dem Termindatum signiert werden.",
      };
    }
    if (message === "ALREADY_SIGNED") {
      return { error: "Diesen Termin hast du bereits bestätigt." };
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

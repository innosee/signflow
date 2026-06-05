"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import {
  assertNotImpersonating,
  getTenantId,
  requireSigningEnabled,
} from "@/lib/dal";
import { sealWithFes } from "@/lib/firma";
import {
  sendParticipantInvite,
  sendParticipantPreviewInvite,
} from "@/lib/participant-tokens";
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
  if (weekday === 0 || weekday === 6) {
    return {
      ok: false,
      error: "Am Wochenende (Sa/So) können keine Coachings stattfinden.",
    };
  }

  let anzahlUe: string;
  let geeignet: boolean | null;
  if (isErstgespraech) {
    anzahlUe = "0";
    if (geeignetRaw !== "ja" && geeignetRaw !== "nein") {
      return {
        ok: false,
        error:
          "Beim Erstgespräch musst du angeben, ob die Teilnehmerin für die Maßnahme geeignet ist.",
      };
    }
    geeignet = geeignetRaw === "ja";
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
  }

  return {
    ok: true,
    values: { sessionDate, topic, modus, anzahlUe, isErstgespraech, geeignet },
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
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { error: "Kurs fehlt." };
  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  const validation = validateSessionFormFields(formData);
  if (!validation.ok) return { error: validation.error };
  const v = validation.values;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.sessions).values({
        courseId: ownedCourseId,
        sessionDate: v.sessionDate,
        topic: v.topic,
        modus: v.modus,
        anzahlUe: v.anzahlUe,
        isErstgespraech: v.isErstgespraech,
        geeignet: v.geeignet,
      });
      // FES-Gates resetten: neue Session ändert den Stand → alte
      // Maßnahme-Abschluss-Bestätigung + ANW-Check-Status sind nicht
      // mehr aussagekräftig.
      await tx
        .update(schema.courses)
        .set({ abgeschlossenAt: null, anwCheckPassedAt: null })
        .where(eq(schema.courses.id, ownedCourseId));
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Session konnte nicht angelegt werden (${message}).` };
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

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.sessions)
        .set({
          sessionDate: v.sessionDate,
          topic: v.topic,
          modus: v.modus,
          anzahlUe: v.anzahlUe,
          isErstgespraech: v.isErstgespraech,
          geeignet: v.geeignet,
        })
        .where(eq(schema.sessions.id, sessionId));
      // FES-Gates resetten — Inhalts-Edit ändert den Stand.
      await tx
        .update(schema.courses)
        .set({ abgeschlossenAt: null, anwCheckPassedAt: null })
        .where(eq(schema.courses.id, ownedCourseId));
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Session konnte nicht aktualisiert werden (${message}).` };
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
        "Dieser Kurs ist bereits mit FES versiegelt und kann rechtlich nicht mehr verändert werden. Bitte einen neuen Kurs anlegen.",
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
      await tx
        .update(schema.courses)
        .set({ abgeschlossenAt: null, anwCheckPassedAt: null })
        .where(eq(schema.courses.id, ownedCourseId));
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
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;
  const tenantId = getTenantId(session);

  const courseId = String(formData.get("courseId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const kundenNr = String(formData.get("kundenNr") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();

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

  // Phone ist optional; wenn gesetzt, normalisieren + strikt validieren.
  // Bei Reuse eines bestehenden TN überschreiben wir die hinterlegte Nummer
  // bewusst NICHT — sonst würde ein zweiter Coach versehentlich die im
  // anderen Kurs eingetragene Nummer überschreiben.
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

  let reused = false;
  try {
    await db.transaction(async (tx) => {
      // Tenant-scoped Lookup — Email ist nur innerhalb eines Tenants unique.
      const [existing] = await tx
        .select({ id: schema.participants.id })
        .from(schema.participants)
        .where(
          and(
            eq(schema.participants.email, email),
            eq(schema.participants.tenantId, tenantId),
          ),
        )
        .limit(1);

      let participantId: string;
      if (existing) {
        participantId = existing.id;
        reused = true;
      } else {
        const [created] = await tx
          .insert(schema.participants)
          .values({ tenantId, name, email, kundenNr, phone })
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

export type UpdateParticipantState = { error?: string } | undefined;

/**
 * Update der TN-Stammdaten (Name, Email, Kunden-Nr., Phone). Coach muss
 * den Kurs besitzen, kein Impersonation. TN ist über `course_participants`
 * an den Kurs gebunden — wir prüfen die Paarung, bevor der zentrale
 * `participants`-Datensatz angefasst wird, sonst könnte ein Coach durch
 * URL-Manipulation an einen TN ran, den er gar nicht betreut.
 *
 * Email-Wechsel ist erlaubt — `participantId` bleibt stabil, aktive Magic-
 * Link-Tokens hängen nicht an der Mail. Bei Konflikt mit existierender
 * Email im selben Tenant (tenant-scoped UNIQUE) wirft DB und wir geben
 * eine saubere Fehlermeldung zurück.
 *
 * Beachtung: bei Reuse über mehrere Kurse (siehe addParticipant) teilen
 * sich die Kurse den Stammdatensatz. Eine Stammdaten-Änderung wirkt
 * also auf ALLE Kurse, in denen der TN eingeschrieben ist — das ist
 * gewollt (Stammdaten sind eben Stamm). Coach wird durch den Confirm-
 * Step im UI darauf hingewiesen, falls der TN mehrfach enrollt ist.
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

  // TN muss tatsächlich in diesem Kurs eingeschrieben sein — verhindert,
  // dass ein Coach einen TN aus einem fremden Kurs ändert. tenant_id
  // filtert zusätzlich gegen Cross-Tenant-Zugriffe (Defense-in-Depth).
  const [enrollment] = await db
    .select({ id: schema.courseParticipants.id })
    .from(schema.courseParticipants)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courseParticipants.participantId),
    )
    .where(
      and(
        eq(schema.courseParticipants.courseId, ownedCourseId),
        eq(schema.courseParticipants.participantId, participantId),
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
    .select({ id: schema.courseParticipants.id })
    .from(schema.courseParticipants)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courseParticipants.participantId),
    )
    .where(
      and(
        eq(schema.courseParticipants.courseId, ownedCourseId),
        eq(schema.courseParticipants.participantId, params.participantId),
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

export type MarkAbgeschlossenState =
  | { error?: string; success?: boolean }
  | undefined;

/**
 * Coach bestätigt: keine weiteren Sessions kommen. Erst nach diesem Klick
 * darf FES-Sealing laufen. Der Klick wird zugelassen wenn ENTWEDER 80%
 * der bewilligten UE geleistet sind ODER der Kurs als vorzeitig beendet
 * gekennzeichnet ist (`flagVorzeitigesEnde=true`) mit Begründung.
 *
 * Beim nächsten Session-Edit/Create/Reopen wird das Feld wieder gelöscht,
 * der Coach muss neu bestätigen.
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

  const ownedCourseId = await requireOwnedCourseId(courseId, coachId);
  if (!ownedCourseId) return { error: "Kurs nicht gefunden." };

  // Gate-Berechnung serverseitig — Client-UI kann den Button zwar grayen,
  // aber die Wahrheit liegt hier.
  const [course] = await db
    .select({
      anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
      flagVorzeitigesEnde: schema.courses.flagVorzeitigesEnde,
      begruendungText: schema.courses.begruendungText,
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
  const erfuellungQuote = geleisteteUe / course.anzahlBewilligteUe;
  const hatVorzeitigesEndeBegruendung =
    course.flagVorzeitigesEnde && (course.begruendungText?.trim().length ?? 0) > 0;

  if (erfuellungQuote < 0.8 && !hatVorzeitigesEndeBegruendung) {
    return {
      error: `Maßnahme kann erst abgeschlossen werden, wenn ≥80% der bewilligten UE geleistet sind (aktuell ${geleisteteUe} von ${course.anzahlBewilligteUe} = ${Math.round(erfuellungQuote * 100)}%). Bei vorzeitigem Ende: Kurs-Stammdaten → „vorzeitig beendet" + Begründung setzen.`,
    };
  }

  try {
    await db
      .update(schema.courses)
      .set({ abgeschlossenAt: new Date() })
      .where(eq(schema.courses.id, ownedCourseId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Markierung fehlgeschlagen (${message}).` };
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
  const session = await requireSigningEnabled();
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

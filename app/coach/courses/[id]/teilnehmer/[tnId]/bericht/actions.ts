"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { courseVisibleToCoach } from "@/lib/course-access";
import { geleisteteUeForCourse } from "@/lib/course-ue";
import { formatUeDE } from "@/lib/format-ue";
import { buildAblaufDraft } from "@/lib/checker/ablauf-draft";
import {
  inputsEqual,
  readHardBlocks,
  readSnapshotInput,
} from "@/lib/checker/snapshot";
import { type MassnahmeTyp, resolveMassnahmeTyp } from "@/lib/checker/types";
import {
  integrationsergebnisVariante,
  parseIntegrationsergebnisField,
  validateIntegrationsergebnis,
} from "@/lib/integrationsergebnis";
import { isImpersonating, requireCoach } from "@/lib/dal";
import { formatDateDE } from "@/lib/format-date";

export type BerActionState =
  | { error?: string; savedAt?: string; berId?: string }
  | undefined;

const OVERRIDE_REASON_MIN = 10;
const OVERRIDE_REASON_MAX = 500;
const SONSTIGES_MAX = 4000;

type OwnedContext = {
  courseId: string;
  participantId: string;
  coachId: string;
  massnahmeTyp: MassnahmeTyp;
};

/**
 * Prüft: (1) Coach ist im Kompetenzteam des Kurses, (2) TN ist im Kurs
 * eingeschrieben. Ohne beides darf weder draft noch submit durchgehen. Liefert
 * zusätzlich den Maßnahmentyp (für die Integrationsergebnis-Variante).
 */
async function requireOwnedTnContext(
  courseId: string,
  participantId: string,
  coachId: string,
): Promise<OwnedContext | null> {
  const [row] = await db
    .select({ massnahmeTyp: schema.courses.massnahmeTyp })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.id, courseId),
        courseVisibleToCoach(coachId),
        isNull(schema.courses.deletedAt),
        eq(schema.courses.participantId, participantId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    courseId,
    participantId,
    coachId,
    massnahmeTyp: resolveMassnahmeTyp(row.massnahmeTyp),
  };
}

async function currentRequestMeta() {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const ua = h.get("user-agent") ?? null;
  return { ip, ua };
}

/**
 * Validiert das Abschlussdatum aus dem Formular. `<input type="date">` liefert
 * ISO `yyyy-mm-dd` oder Leerstring. Alles andere → null (kein Datum). Verhindert
 * Müll in der `date`-Spalte, ohne eine schwere Datums-Lib zu ziehen.
 */
function parseIsoDate(raw: string): string | null {
  const v = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : v;
}

/**
 * Autosave eines Entwurfs. Upsert-Logik: existiert ein BER für (course, TN),
 * werden Texte aktualisiert; sonst wird ein neuer angelegt. Status wird NICHT
 * automatisch auf "draft" zurückgesetzt — wer nach Einreichung noch editiert,
 * bleibt im Status "submitted" (mit aktualisiertem `updated_at`).
 */
export async function saveBerDraftAction(
  _prev: BerActionState,
  formData: FormData,
): Promise<BerActionState> {
  const session = await requireCoach();
  if (isImpersonating(session)) {
    return { error: "Nur-Lese-Modus: während Impersonation wird nicht gespeichert." };
  }
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const participantId = String(formData.get("participantId") ?? "").trim();
  const teilnahme = String(formData.get("teilnahme") ?? "");
  const ablauf = String(formData.get("ablauf") ?? "");
  const fazit = String(formData.get("fazit") ?? "");
  const sonstiges = String(formData.get("sonstiges") ?? "").slice(
    0,
    SONSTIGES_MAX,
  );
  const keineFehlzeiten = formData.get("keineFehlzeiten") === "true";
  const abschlussDatum = parseIsoDate(String(formData.get("abschlussDatum") ?? ""));

  if (!courseId || !participantId) {
    return { error: "Kurs oder Teilnehmer fehlt." };
  }

  const ctx = await requireOwnedTnContext(courseId, participantId, coachId);
  if (!ctx) return { error: "Kurs/Teilnehmer nicht gefunden." };

  // Integrationsergebnis: im Entwurf ohne Pflicht-Check gespeichert (Teil-
  // stand darf hängen). ESCA → Variante null → immer null.
  const ieVariante = integrationsergebnisVariante(ctx.massnahmeTyp);
  const integrationsergebnis = parseIntegrationsergebnisField(
    formData.get("integrationsergebnis"),
    ieVariante,
  );

  const [existing] = await db
    .select()
    .from(schema.abschlussberichte)
    .where(
      and(
        eq(schema.abschlussberichte.courseId, courseId),
        eq(schema.abschlussberichte.participantId, participantId),
      ),
    )
    .limit(1);

  const wasSubmittedBefore = existing?.status === "submitted";

  let berId: string;
  if (existing) {
    await db
      .update(schema.abschlussberichte)
      .set({
        teilnahme,
        ablauf,
        fazit,
        sonstiges,
        keineFehlzeiten,
        abschlussDatum,
        integrationsergebnis,
      })
      .where(eq(schema.abschlussberichte.id, existing.id));
    berId = existing.id;
  } else {
    const [created] = await db
      .insert(schema.abschlussberichte)
      .values({
        courseId,
        participantId,
        coachId,
        teilnahme,
        ablauf,
        fazit,
        sonstiges,
        keineFehlzeiten,
        abschlussDatum,
        integrationsergebnis,
      })
      .returning({ id: schema.abschlussberichte.id });
    berId = created.id;
  }

  // Audit-Logging:
  // - Erste Draft-Anlage: ein Event (`ber.draft_saved`). Autosaves danach loggen bewusst nicht,
  //   weil sonst bei Debounce von ~1 s der Log mit jedem Tipp-Event überfluten würde.
  // - Edit nach Submit: jede Änderung wird als `ber.edited_after_submit` geloggt, damit die
  //   Nachvollziehbarkeit der Bildungsträger-Sicht sauber bleibt.
  const { ip, ua } = await currentRequestMeta();
  if (wasSubmittedBefore) {
    await logAudit({
      actorType: "coach",
      actorId: coachId,
      action: "ber.edited_after_submit",
      resourceType: "abschlussbericht",
      resourceId: berId,
      metadata: { courseId, participantId },
      ipAddress: ip,
      userAgent: ua,
    });
  } else if (!existing) {
    await logAudit({
      actorType: "coach",
      actorId: coachId,
      action: "ber.draft_saved",
      resourceType: "abschlussbericht",
      resourceId: berId,
      metadata: { courseId, participantId, firstDraft: true },
      ipAddress: ip,
      userAgent: ua,
    });
  }

  revalidatePath(`/coach/courses/${courseId}`);
  revalidatePath(`/coach/courses/${courseId}/teilnehmer/${participantId}/bericht`);

  return { savedAt: new Date().toISOString(), berId };
}

/**
 * Finale Einreichung an den Bildungsträger.
 *
 * Der Berichts-Checker ist bewusst rein beratend (Produktentscheidung) —
 * Hinweise, Verstöße und fehlende Pflichtbausteine blockieren das Einreichen
 * NIE. EINZIGE harte Hürde: Hard-Blocks (explizite Gesundheits-/Art-9-Daten,
 * harte Ablehnungs-Prognose) brauchen eine dokumentierte Override-Begründung,
 * weil die DSGVO-Grundlage (Art. 6 lit. b) Art-9-Freiheit der gespeicherten
 * Berichte voraussetzt. Sonst nur die minimale Struktur-Bedingung (mind. ein
 * Abschnitt mit Inhalt). Die DB-Spalte `lastCheckPassed` bleibt aus Back-Compat
 * auf `true`; der autoritative Inhalts-Review passiert beim Bildungsträger.
 */
export async function submitBerAction(
  _prev: BerActionState,
  formData: FormData,
): Promise<BerActionState> {
  const session = await requireCoach();
  if (isImpersonating(session)) {
    return { error: "Nur-Lese-Modus: während Impersonation kannst du nicht einreichen." };
  }
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const participantId = String(formData.get("participantId") ?? "").trim();
  const teilnahme = String(formData.get("teilnahme") ?? "");
  const ablauf = String(formData.get("ablauf") ?? "");
  const fazit = String(formData.get("fazit") ?? "");
  const sonstigesRaw = String(formData.get("sonstiges") ?? "").trim();
  const sonstiges = sonstigesRaw.slice(0, SONSTIGES_MAX);
  const keineFehlzeiten = formData.get("keineFehlzeiten") === "true";
  const abschlussDatum = parseIsoDate(String(formData.get("abschlussDatum") ?? ""));
  const overrideReasonRaw = String(
    formData.get("mustHaveOverrideReason") ?? "",
  ).trim();
  const overrideActive = overrideReasonRaw.length > 0;
  const checkSnapshotRaw = formData.get("checkSnapshot");
  // Snapshot ist ein String (JSON) vom Client. Wir validieren beim Parse
  // grob auf Objekt-Form — Zod-freie Variante, da das Shape stabil ist
  // und der Client im Zweifel nur sich selbst schadet, nicht dem Server.
  let checkSnapshot: unknown = null;
  if (typeof checkSnapshotRaw === "string" && checkSnapshotRaw.length > 0) {
    try {
      const parsed = JSON.parse(checkSnapshotRaw);
      if (parsed && typeof parsed === "object") {
        checkSnapshot = parsed;
      }
    } catch {
      // Korrupter Snapshot — nicht fatal, wir submitten einfach ohne
    }
  }

  if (!courseId || !participantId) {
    return { error: "Kurs oder Teilnehmer fehlt." };
  }
  // Der Berichts-Checker ist rein beratend — Hinweise/Verstöße/fehlende
  // Pflichtbausteine blockieren das Einreichen NIE. EINZIGE Ausnahme:
  // Hard-Blocks (explizite Gesundheits-/Art-9-Daten, harte Ablehnungs-
  // Prognose) dürfen nicht ungeprüft gespeichert werden (DSGVO Art. 6 lit. b
  // setzt Art-9-Freiheit voraus). Defense-in-Depth gegen den Client-Gate:
  // hat der mitgeschickte Snapshot Hard-Blocks für GENAU den eingereichten
  // Text und fehlt eine Override-Begründung → ablehnen.
  if (!overrideActive) {
    const snapHardBlocks = readHardBlocks(checkSnapshot);
    const snapInput = readSnapshotInput(checkSnapshot);
    const matchesSubmitted =
      !!snapInput && inputsEqual(snapInput, { teilnahme, ablauf, fazit });
    if (snapHardBlocks.length > 0 && matchesSubmitted) {
      return {
        error:
          "Der Bericht enthält als sensibel markierte Inhalte (z.B. Gesundheitsangaben oder eine harte negative Prognose). Bitte entferne die Stelle — oder begründe den Fehlalarm.",
      };
    }
  }
  if (overrideActive) {
    if (overrideReasonRaw.length < OVERRIDE_REASON_MIN) {
      return {
        error: `Begründung für Override muss mindestens ${OVERRIDE_REASON_MIN} Zeichen haben.`,
      };
    }
    if (overrideReasonRaw.length > OVERRIDE_REASON_MAX) {
      return {
        error: `Begründung für Override darf max. ${OVERRIDE_REASON_MAX} Zeichen haben.`,
      };
    }
  }
  // Einzige harte Struktur-Bedingung: mindestens ein Abschnitt mit Inhalt —
  // sonst gibt es buchstäblich nichts einzureichen. Leere Abschnitte bleiben
  // sichtbar leer im PDF; Vollständigkeit beurteilt der Coach (und der
  // Bildungsträger), nicht ein Hard-Gate.
  if (!teilnahme.trim() && !ablauf.trim() && !fazit.trim()) {
    return {
      error:
        "Mindestens ein Abschnitt muss Inhalt haben — sonst gibt es nichts einzureichen.",
    };
  }

  const ctx = await requireOwnedTnContext(courseId, participantId, coachId);
  if (!ctx) return { error: "Kurs/Teilnehmer nicht gefunden." };

  // Integrationsergebnis (nur EKC/ESC/EGC): Ja/Nein ist Pflicht, Datum (+ Firma
  // bei Vermittlung) nur bei „Ja". Server-autoritativ — Variante aus dem Kunden-
  // Maßnahmentyp, nicht aus dem Client.
  const ieVariante = integrationsergebnisVariante(ctx.massnahmeTyp);
  const integrationsergebnis = parseIntegrationsergebnisField(
    formData.get("integrationsergebnis"),
    ieVariante,
  );
  if (ieVariante) {
    const ieError = validateIntegrationsergebnis(integrationsergebnis, ieVariante);
    if (ieError) return { error: ieError };
  }

  // Snapshot-Daten für die Bildungsträger-Liste (Suche, PDF-Filename).
  // Ein einzelner Join genügt — wenn der Coach hier ankommt, ist
  // requireOwnedTnContext schon durch und Course/Participant existieren.
  const [snapshotData] = await db
    .select({
      participantName: schema.participants.name,
      participantKundenNr: schema.participants.kundenNr,
      courseAvgs: schema.courses.avgsNummer,
      courseStart: schema.courses.startDate,
      courseEnd: schema.courses.endDate,
      coachName: schema.users.name,
    })
    .from(schema.participants)
    .innerJoin(
      schema.courses,
      eq(schema.courses.id, courseId),
    )
    .innerJoin(schema.users, eq(schema.users.id, coachId))
    .where(eq(schema.participants.id, participantId))
    .limit(1);

  const geleisteteUe = await geleisteteUeForCourse(courseId);

  const tnName = snapshotData?.participantName ?? "";
  const spaceIdx = tnName.indexOf(" ");
  const tnVornameSnapshot = spaceIdx < 0 ? tnName : tnName.slice(0, spaceIdx);
  const tnNachnameSnapshot = spaceIdx < 0 ? "" : tnName.slice(spaceIdx + 1);
  // Zeitraum im Dokument: Kurs-Start bis Abschlussdatum (= letzter Termin,
  // vom Coach überschreibbar). Fällt auf das Bewilligungsende zurück, wenn
  // kein Abschlussdatum mitkam (z.B. Alt-Bericht ohne den Wert).
  const zeitraumEnde = abschlussDatum ?? snapshotData?.courseEnd ?? null;
  const tnZeitraumSnapshot =
    snapshotData?.courseStart && zeitraumEnde
      ? `${formatDateDE(snapshotData.courseStart)} — ${formatDateDE(zeitraumEnde)}`
      : "";

  const now = new Date();
  const [existing] = await db
    .select({ id: schema.abschlussberichte.id })
    .from(schema.abschlussberichte)
    .where(
      and(
        eq(schema.abschlussberichte.courseId, courseId),
        eq(schema.abschlussberichte.participantId, participantId),
      ),
    )
    .limit(1);

  const snapshotPatch = {
    tnVorname: tnVornameSnapshot,
    tnNachname: tnNachnameSnapshot,
    tnKundenNr: snapshotData?.participantKundenNr ?? "",
    tnAvgsNummer: snapshotData?.courseAvgs ?? "",
    tnZeitraum: tnZeitraumSnapshot,
    // Stundenzahl im Bericht = tatsächlich GELEISTETE UE (nicht die
    // bewilligten): bei vorzeitigem Ende weichen sie auseinander und die AfA
    // bekäme sonst eine nie erbrachte Stundenzahl bescheinigt.
    tnUe: formatUeDE(geleisteteUe),
    coachNameSnapshot: snapshotData?.coachName ?? "",
    abschlussDatum,
    integrationsergebnis,
  };

  let berId: string;
  if (existing) {
    await db
      .update(schema.abschlussberichte)
      .set({
        teilnahme,
        ablauf,
        fazit,
        sonstiges,
        keineFehlzeiten,
        mustHaveOverrideReason: overrideActive ? overrideReasonRaw : null,
        status: "submitted",
        // Override hält DB-Invariante (lastCheckPassed = true) — Begründung
        // dokumentiert die fehlenden Pflicht-Bausteine separat.
        lastCheckPassed: true,
        submittedAt: now,
        checkSnapshot,
        ...snapshotPatch,
        // Re-Submit invalidiert eine frühere Ack — der Bildungsträger
        // soll den neuen Inhalt frisch bewerten.
        softFlagsAcknowledgedAt: null,
        softFlagsAcknowledgedBy: null,
      })
      .where(eq(schema.abschlussberichte.id, existing.id));
    berId = existing.id;
  } else {
    const [created] = await db
      .insert(schema.abschlussberichte)
      .values({
        courseId,
        participantId,
        coachId,
        teilnahme,
        ablauf,
        fazit,
        sonstiges,
        keineFehlzeiten,
        mustHaveOverrideReason: overrideActive ? overrideReasonRaw : null,
        status: "submitted",
        lastCheckPassed: true,
        submittedAt: now,
        checkSnapshot,
        ...snapshotPatch,
      })
      .returning({ id: schema.abschlussberichte.id });
    berId = created.id;
  }

  const { ip, ua } = await currentRequestMeta();
  await logAudit({
    actorType: "coach",
    actorId: coachId,
    action: "ber.submitted",
    resourceType: "abschlussbericht",
    resourceId: berId,
    metadata: { courseId, participantId },
    ipAddress: ip,
    userAgent: ua,
  });

  revalidatePath(`/coach/courses/${courseId}`);
  revalidatePath(`/coach/courses/${courseId}/teilnehmer/${participantId}/bericht`);
  revalidatePath("/coach/checker");
  revalidatePath("/bildungstraeger");

  return { savedAt: now.toISOString(), berId };
}

export type AblaufDraftResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Erzeugt einen deterministischen Entwurf für das BER-Feld „Ablauf, Inhalte
 * des Coachings" aus den Termin-Themen des Kurses. Rein server-seitige
 * String-Assemblierung — kein externer Verarbeiter, keine Anonymisierung
 * nötig (die Daten verlassen die EU-Infra nicht). Coach-scoped via
 * courseVisibleToCoach. Während Impersonation erlaubt (reiner Lese-/
 * Entwurfsschritt, kein Schreibvorgang).
 */
export async function buildAblaufDraftAction(
  courseId: string,
): Promise<AblaufDraftResult> {
  const session = await requireCoach();

  const [course] = await db
    .select({ massnahmeTyp: schema.courses.massnahmeTyp })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.id, courseId),
        courseVisibleToCoach(session.user.id),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);
  if (!course) {
    return { ok: false, error: "Kurs nicht gefunden oder kein Zugriff." };
  }

  const rows = await db
    .select({
      topic: schema.sessions.topic,
      isErstgespraech: schema.sessions.isErstgespraech,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, courseId),
        isNull(schema.sessions.deletedAt),
      ),
    )
    .orderBy(schema.sessions.sessionDate);

  if (rows.length === 0) {
    return {
      ok: false,
      error: "Für diesen Kurs gibt es noch keine Termine zum Vorbefüllen.",
    };
  }

  const text = buildAblaufDraft(rows, resolveMassnahmeTyp(course.massnahmeTyp));
  return { ok: true, text };
}

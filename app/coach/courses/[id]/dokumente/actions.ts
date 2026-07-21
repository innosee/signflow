"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { courseVisibleToCoach } from "@/lib/course-access";
import {
  assertNotImpersonating,
  requireSigningEnabled,
} from "@/lib/dal";
import {
  getDocumentConfig,
  isDocumentType,
  MASTER_FIELD_LABELS,
  missingMasterData,
  missingRequiredFields,
  prefillFormData,
  type DocumentTypeId,
  type ParticipantMasterField,
} from "@/lib/documents/config";
import {
  isMassnahmeTyp,
  MASSNAHME_TYP_LABEL,
} from "@/lib/massnahme-typ";

type ActionState = { error?: string; success?: boolean } | undefined;

/**
 * Lädt einen Kurs (+ Kunde-Daten) für den Coach — sichtbar via Kompetenzteam
 * (Lead ODER zugewiesen). Gibt `null`, wenn der Coach keinen Zugriff hat.
 */
async function loadOwnedCourse(courseId: string, coachId: string) {
  const [row] = await db
    .select({
      id: schema.courses.id,
      participantId: schema.courses.participantId,
      massnahmeTyp: schema.courses.massnahmeTyp,
      durchfuehrungsort: schema.courses.durchfuehrungsort,
      anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
      startDate: schema.courses.startDate,
      endDate: schema.courses.endDate,
      title: schema.courses.title,
    })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.id, courseId),
        isNull(schema.courses.deletedAt),
        courseVisibleToCoach(coachId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Lädt ein Dokument samt Kurs-Zugriffsprüfung für den Coach. */
async function loadOwnedDocument(documentId: string, coachId: string) {
  const [row] = await db
    .select({
      id: schema.documents.id,
      courseId: schema.documents.courseId,
      participantId: schema.documents.participantId,
      type: schema.documents.type,
      status: schema.documents.status,
      formData: schema.documents.formData,
    })
    .from(schema.documents)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.documents.courseId))
    .where(
      and(
        eq(schema.documents.id, documentId),
        isNull(schema.documents.deletedAt),
        isNull(schema.courses.deletedAt),
        courseVisibleToCoach(coachId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Legt ein neues Kunde-Dokument an (Status `draft`) und leitet direkt zum
 * Editor weiter. Felder werden deterministisch aus den Kursdaten vorbefüllt.
 */
export async function createDocument(formData: FormData): Promise<void> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  if (!courseId || !isDocumentType(type)) {
    redirect(`/coach/courses/${courseId}`);
  }

  const course = await loadOwnedCourse(courseId, coachId);
  if (!course) redirect(`/coach/courses/${courseId}`);

  const massnahmeLabel = isMassnahmeTyp(course.massnahmeTyp)
    ? MASSNAHME_TYP_LABEL[course.massnahmeTyp]
    : course.title;

  const prefill = prefillFormData(type as DocumentTypeId, {
    massnahmeLabel,
    durchfuehrungsort: course.durchfuehrungsort,
    anzahlBewilligteUe: course.anzahlBewilligteUe,
    startDate: course.startDate,
    endDate: course.endDate,
  });

  const [inserted] = await db
    .insert(schema.documents)
    .values({
      courseId: course.id,
      participantId: course.participantId,
      type: type as DocumentTypeId,
      status: "draft",
      formData: prefill,
      createdBy: coachId,
    })
    .returning({ id: schema.documents.id });

  await logAudit({
    actorType: "coach",
    actorId: coachId,
    action: "document.created",
    resourceType: "document",
    resourceId: inserted.id,
    metadata: { type, courseId },
  });

  revalidatePath(`/coach/courses/${courseId}`);
  redirect(`/coach/courses/${courseId}/dokumente/${inserted.id}`);
}

const MASTER_FIELDS: ParticipantMasterField[] = [
  "vorname",
  "nachname",
  "strasse",
  "plz",
  "ort",
  "geburtsdatum",
  "geburtsort",
  "phone",
  "festnetz",
];

/**
 * Speichert Draft: Formularfelder (→ documents.form_data) UND die erweiterten
 * Teilnehmer-Stammdaten (→ participants, einmal erfasst, wiederverwendbar) in
 * einem Rutsch. Nur im Draft-Status — ein signiertes Dokument ist eingefroren.
 */
export async function saveDocumentDraft(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const documentId = String(formData.get("documentId") ?? "").trim();
  const doc = await loadOwnedDocument(documentId, coachId);
  if (!doc) return { error: "Dokument nicht gefunden." };
  if (doc.status !== "draft") {
    return { error: "Signiertes Dokument kann nicht mehr bearbeitet werden." };
  }

  // Formularfelder
  const cfg = getDocumentConfig(doc.type as DocumentTypeId);
  const nextForm: Record<string, string> = {
    ...((doc.formData ?? {}) as Record<string, string>),
  };
  for (const field of cfg.fields) {
    const raw = formData.get(field.key);
    if (raw != null) nextForm[field.key] = String(raw).trim();
  }

  // Teilnehmer-Stammdaten (nur wenn das Formular sie überhaupt anzeigt)
  const patch: Record<string, string | null> = {};
  for (const f of MASTER_FIELDS) {
    const raw = formData.get(f);
    if (raw == null) continue;
    const v = String(raw).trim();
    patch[f] = v === "" ? null : v;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.documents)
      .set({ formData: nextForm })
      .where(eq(schema.documents.id, documentId));
    if (Object.keys(patch).length > 0) {
      await tx
        .update(schema.participants)
        .set(patch)
        .where(eq(schema.participants.id, doc.participantId));
    }
  });

  revalidatePath(`/coach/courses/${doc.courseId}/dokumente/${documentId}`);
  return { success: true };
}

/**
 * Coach unterschreibt das Dokument (immer zuerst — deckt „erango zuerst" bei
 * F04/F08 ab). Friert die Feldwerte + Teilnehmer-Stammdaten als Snapshot ein
 * und setzt den Status auf `active`. Danach ist das Dokument für die
 * Teilnehmer-Signatur bereit.
 */
export async function signDocumentAsCoach(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const documentId = String(formData.get("documentId") ?? "").trim();
  const confirmed = formData.get("confirm") === "on";
  if (!confirmed) return { error: "Bitte aktiv bestätigen." };

  const doc = await loadOwnedDocument(documentId, coachId);
  if (!doc) return { error: "Dokument nicht gefunden." };
  if (doc.status !== "draft") {
    return { error: "Dieses Dokument wurde bereits vom Coach signiert." };
  }
  const type = doc.type as DocumentTypeId;

  // Coach-Unterschrift (einmalig hinterlegt) laden.
  const [coach] = await db
    .select({ signatureUrl: schema.users.signatureUrl })
    .from(schema.users)
    .where(eq(schema.users.id, coachId))
    .limit(1);
  if (!coach?.signatureUrl) {
    return {
      error:
        'Du hast noch keine Unterschrift hinterlegt. Lege sie unter „Unterschrift" an.',
    };
  }
  const coachSignatureUrl: string = coach.signatureUrl;

  // Teilnehmer-Stammdaten für Pflichtprüfung + Snapshot laden.
  const [p] = await db
    .select({
      name: schema.participants.name,
      vorname: schema.participants.vorname,
      nachname: schema.participants.nachname,
      strasse: schema.participants.strasse,
      plz: schema.participants.plz,
      ort: schema.participants.ort,
      geburtsdatum: schema.participants.geburtsdatum,
      geburtsort: schema.participants.geburtsort,
      phone: schema.participants.phone,
      festnetz: schema.participants.festnetz,
      email: schema.participants.email,
    })
    .from(schema.participants)
    .where(eq(schema.participants.id, doc.participantId))
    .limit(1);
  if (!p) return { error: "Kunde nicht gefunden." };

  // Harte Hürden: Pflicht-Stammdaten + Pflicht-Formularfelder.
  const missingMaster = missingMasterData(type, p);
  if (missingMaster.length > 0) {
    return {
      error: `Bitte zuerst die Pflicht-Stammdaten ausfüllen: ${missingMaster
        .map((f) => MASTER_FIELD_LABELS[f])
        .join(", ")}.`,
    };
  }
  const missingFields = missingRequiredFields(type, doc.formData ?? {});
  if (missingFields.length > 0) {
    return {
      error: `Bitte zuerst die Pflichtfelder ausfüllen: ${missingFields
        .map((f) => f.label)
        .join(", ")}.`,
    };
  }

  const ipAddress =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  // Snapshot der Stammdaten in form_data einfrieren (siehe loadDocumentSheet).
  const snapshot: Record<string, string> = {
    ...((doc.formData ?? {}) as Record<string, string>),
    tn_name: p.name,
    tn_vorname: p.vorname ?? "",
    tn_nachname: p.nachname ?? "",
    tn_strasse: p.strasse ?? "",
    tn_plz: p.plz ?? "",
    tn_ort: p.ort ?? "",
    tn_geburtsdatum: p.geburtsdatum ?? "",
    tn_geburtsort: p.geburtsort ?? "",
    tn_phone: p.phone ?? "",
    tn_festnetz: p.festnetz ?? "",
    tn_email: p.email,
  };

  try {
    await db.transaction(async (tx) => {
      // Re-Check innerhalb der TX gegen Race (Doppel-Signatur).
      const [fresh] = await tx
        .select({ status: schema.documents.status })
        .from(schema.documents)
        .where(eq(schema.documents.id, documentId))
        .limit(1);
      if (!fresh || fresh.status !== "draft") throw new Error("ALREADY_SIGNED");

      await tx.insert(schema.documentSignatures).values({
        documentId,
        signerType: "coach",
        coachId,
        signatureUrl: coachSignatureUrl,
        ipAddress,
      });

      await tx
        .update(schema.documents)
        .set({ status: "active", formData: snapshot })
        .where(eq(schema.documents.id, documentId));

      await logAudit(
        {
          actorType: "coach",
          actorId: coachId,
          action: "document.coach_signed",
          resourceType: "document",
          resourceId: documentId,
          metadata: { type },
          ipAddress,
        },
        tx,
      );
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "ALREADY_SIGNED") {
      return { error: "Dieses Dokument wurde bereits signiert." };
    }
    console.error("signDocumentAsCoach failed:", err);
    return { error: "Signieren fehlgeschlagen. Bitte erneut versuchen." };
  }

  revalidatePath(`/coach/courses/${doc.courseId}/dokumente/${documentId}`);
  revalidatePath(`/coach/courses/${doc.courseId}`);
  return { success: true };
}

/** Soft-Delete eines Dokuments (nur solange noch nicht abgeschlossen). */
export async function deleteDocument(formData: FormData): Promise<void> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const documentId = String(formData.get("documentId") ?? "").trim();
  const doc = await loadOwnedDocument(documentId, coachId);
  if (!doc) redirect(`/coach/courses`);
  if (doc.status === "completed") {
    // Abgeschlossene Dokumente bleiben erhalten (Nachweis).
    redirect(`/coach/courses/${doc.courseId}/dokumente/${documentId}`);
  }

  await db
    .update(schema.documents)
    .set({ deletedAt: new Date() })
    .where(eq(schema.documents.id, documentId));

  await logAudit({
    actorType: "coach",
    actorId: coachId,
    action: "document.deleted",
    resourceType: "document",
    resourceId: documentId,
    metadata: { type: doc.type },
  });

  revalidatePath(`/coach/courses/${doc.courseId}`);
  redirect(`/coach/courses/${doc.courseId}`);
}

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
  MASTER_FIELD_ORDER,
  missingMasterData,
  missingRequiredFields,
  prefillFormData,
  type DocumentTypeId,
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

type OwnedDocument = NonNullable<Awaited<ReturnType<typeof loadOwnedDocument>>>;

/**
 * Persistiert Formularfelder (→ documents.form_data) UND die erweiterten
 * Teilnehmer-Stammdaten (→ participants, einmal erfasst, wiederverwendbar).
 * Nur im Draft-Status. Gibt die frisch gespeicherte `form_data` zurück, damit
 * ein direkt danach laufender Freigabe-Schritt gegen den AKTUELLEN Stand prüft
 * (kein „erst speichern"-Fallstrick).
 */
async function persistDraft(
  doc: OwnedDocument,
  formData: FormData,
): Promise<Record<string, string>> {
  const cfg = getDocumentConfig(doc.type as DocumentTypeId);
  const nextForm: Record<string, string> = {
    ...((doc.formData ?? {}) as Record<string, string>),
  };
  for (const field of cfg.fields) {
    const raw = formData.get(field.key);
    if (raw != null) nextForm[field.key] = String(raw).trim();
  }

  // Stammdaten-Inputs tragen den `m_`-Namensraum (siehe document-editor.tsx),
  // damit ein Formularfeld mit gleichem Schlüssel (z.B. `ort`) sie nicht
  // überschreibt.
  const patch: Record<string, string | null> = {};
  for (const f of MASTER_FIELD_ORDER) {
    const raw = formData.get(`m_${f}`);
    if (raw == null) continue;
    const v = String(raw).trim();
    patch[f] = v === "" ? null : v;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.documents)
      .set({ formData: nextForm })
      .where(eq(schema.documents.id, doc.id));
    if (Object.keys(patch).length > 0) {
      await tx
        .update(schema.participants)
        .set(patch)
        .where(eq(schema.participants.id, doc.participantId));
    }
  });

  return nextForm;
}

/**
 * Ein Editor-Submit. `intent=save` speichert nur (Entwurf). `intent=release`
 * speichert ebenfalls und gibt das Dokument danach frei: Pflichtprüfung →
 * Snapshot einfrieren → Status `active`. Bei Formularen mit Coach-Unterschrift
 * (nur STV) wird zusätzlich die Coach-Signatur gesetzt; sonst reicht die
 * Freigabe (nur der Teilnehmer unterschreibt).
 *
 * Weil IMMER zuerst persistiert wird, kann die Pflichtprüfung nicht mehr an
 * ungespeicherten Eingaben scheitern.
 */
export async function submitDocumentEditor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const documentId = String(formData.get("documentId") ?? "").trim();
  const intent = String(formData.get("intent") ?? "save");
  const doc = await loadOwnedDocument(documentId, coachId);
  if (!doc) return { error: "Dokument nicht gefunden." };
  if (doc.status !== "draft") {
    return { error: "Dieses Dokument ist bereits freigegeben." };
  }
  const type = doc.type as DocumentTypeId;
  const cfg = getDocumentConfig(type);

  const nextForm = await persistDraft(doc, formData);

  const revalidate = () => {
    revalidatePath(`/coach/courses/${doc.courseId}/dokumente/${documentId}`);
    revalidatePath(`/coach/courses/${doc.courseId}`);
  };

  if (intent !== "release") {
    revalidate();
    return { success: true };
  }

  // --- Freigabe ---
  if (formData.get("confirm") !== "on") {
    return { error: "Bitte aktiv bestätigen." };
  }

  // Teilnehmer-Stammdaten (frisch, nach persistDraft) für Pflichtprüfung + Snapshot.
  const [p] = await db
    .select({
      name: schema.participants.name,
      vorname: schema.participants.vorname,
      nachname: schema.participants.nachname,
      strasse: schema.participants.strasse,
      plz: schema.participants.plz,
      ort: schema.participants.ort,
      geburtsort: schema.participants.geburtsort,
      phone: schema.participants.phone,
      festnetz: schema.participants.festnetz,
      email: schema.participants.email,
    })
    .from(schema.participants)
    .where(eq(schema.participants.id, doc.participantId))
    .limit(1);
  if (!p) return { error: "Kunde nicht gefunden." };

  const missingMaster = missingMasterData(type, p);
  if (missingMaster.length > 0) {
    return {
      error: `Bitte zuerst die Pflicht-Stammdaten ausfüllen: ${missingMaster
        .map((f) => MASTER_FIELD_LABELS[f])
        .join(", ")}.`,
    };
  }
  const missingFields = missingRequiredFields(type, nextForm);
  if (missingFields.length > 0) {
    return {
      error: `Bitte zuerst die Pflichtfelder ausfüllen: ${missingFields
        .map((f) => f.label)
        .join(", ")}.`,
    };
  }

  // Coach-Signatur nur bei Formularen, die sie vorsehen (STV).
  let coachSignatureUrl: string | null = null;
  if (cfg.signers.coach) {
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
    coachSignatureUrl = coach.signatureUrl;
  }

  const ipAddress =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  // Snapshot der Stammdaten in form_data einfrieren (siehe loadDocumentSheet).
  const snapshot: Record<string, string> = {
    ...nextForm,
    tn_name: p.name,
    tn_vorname: p.vorname ?? "",
    tn_nachname: p.nachname ?? "",
    tn_strasse: p.strasse ?? "",
    tn_plz: p.plz ?? "",
    tn_ort: p.ort ?? "",
    tn_geburtsort: p.geburtsort ?? "",
    tn_phone: p.phone ?? "",
    tn_festnetz: p.festnetz ?? "",
    tn_email: p.email,
  };

  try {
    await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select({ status: schema.documents.status })
        .from(schema.documents)
        .where(eq(schema.documents.id, documentId))
        .limit(1);
      if (!fresh || fresh.status !== "draft") throw new Error("ALREADY_ACTIVE");

      if (coachSignatureUrl) {
        await tx.insert(schema.documentSignatures).values({
          documentId,
          signerType: "coach",
          coachId,
          signatureUrl: coachSignatureUrl,
          ipAddress,
        });
      }

      await tx
        .update(schema.documents)
        .set({ status: "active", formData: snapshot })
        .where(eq(schema.documents.id, documentId));

      await logAudit(
        {
          actorType: "coach",
          actorId: coachId,
          action: coachSignatureUrl
            ? "document.coach_signed"
            : "document.released",
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
    if (message === "ALREADY_ACTIVE") {
      return { error: "Dieses Dokument wurde bereits freigegeben." };
    }
    console.error("submitDocumentEditor(release) failed:", err);
    return { error: "Freigabe fehlgeschlagen. Bitte erneut versuchen." };
  }

  revalidate();
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

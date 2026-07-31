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
  isDocumentOwnedBy,
  isDocumentType,
  prefillFormData,
  type DocumentTypeId,
} from "@/lib/documents/config";
import {
  collectAllFormValues,
  submitDocument,
} from "@/lib/documents/editor-core";
import {
  isMassnahmeTyp,
  MASSNAHME_TYP_LABEL,
} from "@/lib/massnahme-typ";

type ActionState =
  | {
      error?: string;
      success?: boolean;
      /**
       * Abgeschickte Roh-Eingaben (Feldname → Wert), die der Editor bei einem
       * Fehler als defaultValue zurückspielt — sonst setzt React 19 das
       * Formular auf die alten Werte zurück und Getipptes geht verloren
       * (AGENTS.md / docs/forms-server-actions.md).
       */
      values?: Record<string, string>;
    }
  | undefined;

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
 * Editor weiter. Der Coach verwaltet **nur** die Strategievereinbarung (STV);
 * die BT-Dokumente (Datenschutz/Teilnehmervertrag/Merge) legt der
 * Bildungsträger an.
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
  // Coach darf nur eigene (STV) Dokumente anlegen.
  if (!isDocumentOwnedBy(type as DocumentTypeId, "coach")) {
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

/**
 * Ein Editor-Submit (Coach). Delegiert Persist/Freigabe an den rollen-
 * übergreifenden Kern (`submitDocument`); als zweite Signatur dient die
 * persönliche Coach-Unterschrift.
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
  // Werte-Echo vor dem Laden bauen, damit auch „nicht gefunden" die Eingaben
  // erhält (kein React-19-Form-Reset).
  const submitted = collectAllFormValues(formData);
  const doc = await loadOwnedDocument(documentId, coachId);
  if (!doc) return { error: "Dokument nicht gefunden.", values: submitted };

  const type = doc.type as DocumentTypeId;
  const ipAddress =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const outcome = await submitDocument({
    doc: {
      id: doc.id,
      courseId: doc.courseId,
      participantId: doc.participantId,
      type,
      status: doc.status,
      formData: doc.formData as Record<string, unknown> | null,
    },
    formData,
    intent,
    actor: { type: "coach", userId: coachId },
    ipAddress,
    resolveOrgSignature: async () => {
      const [coach] = await db
        .select({ signatureUrl: schema.users.signatureUrl })
        .from(schema.users)
        .where(eq(schema.users.id, coachId))
        .limit(1);
      return coach?.signatureUrl ?? null;
    },
  });

  if (outcome.status === "error") {
    return outcome.echo
      ? { error: outcome.message, values: submitted }
      : { error: outcome.message };
  }

  revalidatePath(`/coach/courses/${doc.courseId}/dokumente/${documentId}`);
  revalidatePath(`/coach/courses/${doc.courseId}`);
  return { success: true };
}

/**
 * Soft-Delete eines Dokuments (nur eigene STV). Auf User-Wunsch (2026-07-31)
 * auch für abgeschlossene (beidseitig signierte) Dokumente erlaubt — es ist ein
 * Soft-Delete (deleted_at), die Zeile + Signaturen bleiben in der DB und das
 * Audit-Log hält die Löschung fest.
 */
export async function deleteDocument(formData: FormData): Promise<void> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const documentId = String(formData.get("documentId") ?? "").trim();
  const doc = await loadOwnedDocument(documentId, coachId);
  if (!doc) redirect(`/coach/courses`);
  // Coach darf nur eigene (STV) Dokumente löschen — BT-Docs sieht er read-only.
  if (!isDocumentOwnedBy(doc.type as DocumentTypeId, "coach")) {
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
    metadata: { type: doc.type, status: doc.status },
  });

  revalidatePath(`/coach/courses/${doc.courseId}`);
  redirect(`/coach/courses/${doc.courseId}`);
}

/**
 * Setzt ein freigegebenes (`active`), aber vom Kunden noch NICHT signiertes
 * Dokument zurück auf `draft`, damit Tippfehler VOR der Kundenunterschrift
 * korrigiert werden können. Die Coach-Unterschrift (erango-Seite) wird dabei
 * zurückgenommen und muss nach der Korrektur neu geleistet werden. Nach der
 * Kundenunterschrift (`completed`) nicht mehr möglich.
 */
export async function reopenDocument(formData: FormData): Promise<void> {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const documentId = String(formData.get("documentId") ?? "").trim();
  const doc = await loadOwnedDocument(documentId, coachId);
  if (!doc) redirect(`/coach/courses`);
  const backToDoc = `/coach/courses/${doc.courseId}/dokumente/${documentId}`;
  if (!isDocumentOwnedBy(doc.type as DocumentTypeId, "coach")) redirect(backToDoc);
  // Nur „active" (erango-Seite signiert, Kunde noch nicht) lässt sich zurückholen.
  if (doc.status !== "active") redirect(backToDoc);

  try {
    await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select({ status: schema.documents.status })
        .from(schema.documents)
        .where(eq(schema.documents.id, documentId))
        .limit(1);
      if (!fresh || fresh.status !== "active") throw new Error("NOT_ACTIVE");
      // Race-Absicherung: hat der Kunde inzwischen signiert, nicht zurückholen.
      const [pSig] = await tx
        .select({ id: schema.documentSignatures.id })
        .from(schema.documentSignatures)
        .where(
          and(
            eq(schema.documentSignatures.documentId, documentId),
            eq(schema.documentSignatures.signerType, "participant"),
          ),
        )
        .limit(1);
      if (pSig) throw new Error("ALREADY_SIGNED");
      // Erango-Signatur zurücknehmen + zurück auf Entwurf.
      await tx
        .delete(schema.documentSignatures)
        .where(eq(schema.documentSignatures.documentId, documentId));
      await tx
        .update(schema.documents)
        .set({ status: "draft" })
        .where(eq(schema.documents.id, documentId));
      await logAudit(
        {
          actorType: "coach",
          actorId: coachId,
          action: "document.reopened",
          resourceType: "document",
          resourceId: documentId,
          metadata: { type: doc.type },
        },
        tx,
      );
    });
  } catch {
    // Nicht mehr zurückholbar (Race o.ä.) → zurück zur Detailseite.
    redirect(backToDoc);
  }

  revalidatePath(backToDoc);
  redirect(backToDoc);
}

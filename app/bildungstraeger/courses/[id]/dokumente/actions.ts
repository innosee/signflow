"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import {
  assertNotImpersonating,
  getTenantId,
  isImpersonating,
  requireBildungstraeger,
} from "@/lib/dal";
import { sendParticipantInvite } from "@/lib/participant-tokens";
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
      /** Werte-Echo bei Fehler (kein React-19-Form-Reset, siehe AGENTS.md). */
      values?: Record<string, string>;
    }
  | undefined;

/**
 * Lädt einen Kurs (+ Kunde-Daten) tenant-gescoped für den Bildungsträger — der
 * Kunde (participant) trägt die tenant_id, das ist die verlässliche Isolation.
 */
async function loadTenantCourse(courseId: string, tenantId: string) {
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
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(
      and(
        eq(schema.courses.id, courseId),
        isNull(schema.courses.deletedAt),
        eq(schema.participants.tenantId, tenantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Lädt ein Dokument tenant-gescoped für den Bildungsträger. */
async function loadTenantDocument(documentId: string, tenantId: string) {
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
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.documents.participantId),
    )
    .where(
      and(
        eq(schema.documents.id, documentId),
        isNull(schema.documents.deletedAt),
        isNull(schema.courses.deletedAt),
        eq(schema.participants.tenantId, tenantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Legt ein neues BT-Dokument an (Datenschutz/Teilnehmervertrag/Merge) und
 * leitet zum Editor. Die STV verwaltet der Coach — hier hart abgelehnt.
 */
export async function createDocument(formData: FormData): Promise<void> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);

  const courseId = String(formData.get("courseId") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  if (!courseId || !isDocumentType(type)) {
    redirect(`/bildungstraeger/courses/${courseId}/dokumente`);
  }
  if (!isDocumentOwnedBy(type as DocumentTypeId, "bildungstraeger")) {
    redirect(`/bildungstraeger/courses/${courseId}/dokumente`);
  }

  const course = await loadTenantCourse(courseId, tenantId);
  if (!course) redirect(`/bildungstraeger/courses`);

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
      createdBy: session.user.id,
    })
    .returning({ id: schema.documents.id });

  await logAudit({
    actorType: "bildungstraeger",
    actorId: session.user.id,
    action: "document.created",
    resourceType: "document",
    resourceId: inserted.id,
    metadata: { type, courseId },
  });

  revalidatePath(`/bildungstraeger/courses/${courseId}/dokumente`);
  redirect(`/bildungstraeger/courses/${courseId}/dokumente/${inserted.id}`);
}

/**
 * Ein Editor-Submit (Bildungsträger). Delegiert Persist/Freigabe an den
 * rollen-übergreifenden Kern; als zweite Signatur dient die geteilte
 * Organisations-Unterschrift (`tenants.signature_url`).
 */
export async function submitDocumentEditor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);

  const documentId = String(formData.get("documentId") ?? "").trim();
  const intent = String(formData.get("intent") ?? "save");
  // Werte-Echo vor dem Laden bauen, damit auch „nicht gefunden" die Eingaben
  // erhält (kein React-19-Form-Reset).
  const submitted = collectAllFormValues(formData);
  const doc = await loadTenantDocument(documentId, tenantId);
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
    actor: { type: "bildungstraeger", userId: session.user.id },
    ipAddress,
    resolveOrgSignature: async () => {
      const [tenant] = await db
        .select({ signatureUrl: schema.tenants.signatureUrl })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      return tenant?.signatureUrl ?? null;
    },
  });

  if (outcome.status === "error") {
    return outcome.echo
      ? { error: outcome.message, values: submitted }
      : { error: outcome.message };
  }

  revalidatePath(
    `/bildungstraeger/courses/${doc.courseId}/dokumente/${documentId}`,
  );
  revalidatePath(`/bildungstraeger/courses/${doc.courseId}/dokumente`);
  return { success: true };
}

/**
 * Soft-Delete eines BT-Dokuments. Auf User-Wunsch (2026-07-31) auch für
 * abgeschlossene (beidseitig signierte) Dokumente erlaubt — Soft-Delete
 * (deleted_at), Zeile + Signaturen bleiben in der DB, Audit-Log hält die
 * Löschung fest.
 */
export async function deleteDocument(formData: FormData): Promise<void> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);

  const documentId = String(formData.get("documentId") ?? "").trim();
  const doc = await loadTenantDocument(documentId, tenantId);
  if (!doc) redirect(`/bildungstraeger/courses`);
  if (!isDocumentOwnedBy(doc.type as DocumentTypeId, "bildungstraeger")) {
    redirect(`/bildungstraeger/courses/${doc.courseId}/dokumente/${documentId}`);
  }

  await db
    .update(schema.documents)
    .set({ deletedAt: new Date() })
    .where(eq(schema.documents.id, documentId));

  await logAudit({
    actorType: "bildungstraeger",
    actorId: session.user.id,
    action: "document.deleted",
    resourceType: "document",
    resourceId: documentId,
    metadata: { type: doc.type, status: doc.status },
  });

  revalidatePath(`/bildungstraeger/courses/${doc.courseId}/dokumente`);
  redirect(`/bildungstraeger/courses/${doc.courseId}/dokumente`);
}

/**
 * Setzt ein freigegebenes (`active`), aber vom Kunden noch NICHT signiertes
 * BT-Dokument zurück auf `draft`, damit Tippfehler VOR der Kundenunterschrift
 * korrigiert werden können. Die geteilte Org-Unterschrift wird zurückgenommen
 * und muss nach der Korrektur neu geleistet werden. Nach der Kundenunterschrift
 * (`completed`) nicht mehr möglich.
 */
export async function reopenDocument(formData: FormData): Promise<void> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);

  const documentId = String(formData.get("documentId") ?? "").trim();
  const doc = await loadTenantDocument(documentId, tenantId);
  if (!doc) redirect(`/bildungstraeger/courses`);
  const backToDoc = `/bildungstraeger/courses/${doc.courseId}/dokumente/${documentId}`;
  if (!isDocumentOwnedBy(doc.type as DocumentTypeId, "bildungstraeger")) {
    redirect(backToDoc);
  }
  if (doc.status !== "active") redirect(backToDoc);

  try {
    await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select({ status: schema.documents.status })
        .from(schema.documents)
        .where(eq(schema.documents.id, documentId))
        .limit(1);
      if (!fresh || fresh.status !== "active") throw new Error("NOT_ACTIVE");
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
      await tx
        .delete(schema.documentSignatures)
        .where(eq(schema.documentSignatures.documentId, documentId));
      await tx
        .update(schema.documents)
        .set({ status: "draft" })
        .where(eq(schema.documents.id, documentId));
      await logAudit(
        {
          actorType: "bildungstraeger",
          actorId: session.user.id,
          action: "document.reopened",
          resourceType: "document",
          resourceId: documentId,
          metadata: { type: doc.type },
        },
        tx,
      );
    });
  } catch {
    redirect(backToDoc);
  }

  revalidatePath(backToDoc);
  redirect(backToDoc);
}

// --- Teilnehmer erneut benachrichtigen (Signatur-Mail neu) -----------------

export type NotifyDocState =
  | { error?: string; success?: boolean }
  | undefined;

/**
 * Schickt dem Teilnehmer die Signatur-Mail (kurs-weiter Magic-Link, 7 Tage
 * gültig) erneut — für ein freigegebenes, aber noch nicht signiertes Dokument
 * (`active`). Ändert das Dokument NICHT (keine Zurücknahme der erango-Signatur).
 * Tenant-gescoped.
 */
export async function notifyDocumentParticipant(
  _prev: NotifyDocState,
  formData: FormData,
): Promise<NotifyDocState> {
  const session = await requireBildungstraeger();
  if (isImpersonating(session)) {
    return { error: "Während Impersonation nicht möglich." };
  }
  const tenantId = getTenantId(session);

  const documentId = String(formData.get("documentId") ?? "").trim();
  const doc = await loadTenantDocument(documentId, tenantId);
  if (!doc) return { error: "Dokument nicht gefunden." };
  if (doc.status !== "active") {
    return {
      error: "Nur möglich, solange auf die Teilnehmer-Unterschrift gewartet wird.",
    };
  }

  try {
    await sendParticipantInvite({
      courseId: doc.courseId,
      participantId: doc.participantId,
      channel: "email",
    });
  } catch {
    return {
      error: "Mail konnte nicht gesendet werden. Bitte später erneut versuchen.",
    };
  }

  await logAudit({
    actorType: "bildungstraeger",
    actorId: session.user.id,
    action: "document.participant_reminded",
    resourceType: "document",
    resourceId: documentId,
    metadata: { courseId: doc.courseId, type: doc.type },
  });

  return { success: true };
}

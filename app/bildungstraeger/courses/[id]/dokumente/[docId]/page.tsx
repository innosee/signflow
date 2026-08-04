import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { DocumentSheet } from "@/components/documents/document-sheet";
import { DocumentEditor } from "@/components/documents/document-editor";
import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";
import {
  getDocumentConfig,
  isDocumentOwnedBy,
  type DocumentTypeId,
} from "@/lib/documents/config";
import { loadDocumentSheet } from "@/lib/documents/data";
import { DeleteDocumentButton } from "@/components/documents/delete-document-button";
import { ReopenDocumentButton } from "@/components/documents/reopen-document-button";
import { NotifyDocParticipantButton } from "@/components/documents/notify-doc-participant-button";

import {
  confirmDocumentAnalogAction,
  deleteDocument,
  notifyDocumentParticipant,
  reopenDocument,
  submitDocumentEditor,
} from "../actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; docId: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf",
  active: "Wartet auf Teilnehmer:in",
  completed: "Abgeschlossen",
};

export default async function BildungstraegerDocumentPage({ params }: Props) {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);
  const { id: courseId, docId } = await params;

  const [row] = await db
    .select({
      id: schema.documents.id,
      type: schema.documents.type,
      status: schema.documents.status,
      formData: schema.documents.formData,
      participantId: schema.documents.participantId,
      vorname: schema.participants.vorname,
      nachname: schema.participants.nachname,
      strasse: schema.participants.strasse,
      plz: schema.participants.plz,
      ort: schema.participants.ort,
      geburtsdatum: schema.participants.geburtsdatum,
      geburtsort: schema.participants.geburtsort,
      phone: schema.participants.phone,
      festnetz: schema.participants.festnetz,
      signatureMode: schema.courses.signatureMode,
    })
    .from(schema.documents)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.documents.courseId))
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.documents.participantId),
    )
    .where(
      and(
        eq(schema.documents.id, docId),
        eq(schema.documents.courseId, courseId),
        isNull(schema.documents.deletedAt),
        isNull(schema.courses.deletedAt),
        eq(schema.participants.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!row) notFound();
  const analog = row.signatureMode === "analog";

  const sheet = await loadDocumentSheet(docId);
  if (!sheet) notFound();

  const [tenant] = await db
    .select({ signatureUrl: schema.tenants.signatureUrl })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  const type = row.type as DocumentTypeId;
  const cfg = getDocumentConfig(type);
  // Der Bildungsträger verwaltet DS/TNV/Merge; die STV (Coach) sieht er nur
  // read-only + PDF.
  const canEdit = isDocumentOwnedBy(type, "bildungstraeger");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/bildungstraeger/courses/${courseId}/dokumente`}
            className="text-sm text-zinc-600 underline-offset-2 hover:underline"
          >
            ← zurück zu Dokumente
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-zinc-900">
            {cfg.formNumber} · {cfg.label}
          </h1>
          <p className="text-xs text-zinc-500">
            Status: {STATUS_LABEL[row.status] ?? row.status}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/bildungstraeger/courses/${courseId}/dokumente/${docId}/print`}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Druckansicht
          </Link>
          <a
            href={`/api/bildungstraeger/documents/${docId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            PDF
          </a>
          {canEdit && row.status === "active" && (
            <>
              {/* Analog-Modus: kein Magic-Link → kein Benachrichtigen. */}
              {!analog && (
                <NotifyDocParticipantButton
                  action={notifyDocumentParticipant}
                  documentId={docId}
                />
              )}
              <ReopenDocumentButton action={reopenDocument} documentId={docId} />
            </>
          )}
          {canEdit && (
            <DeleteDocumentButton
              action={deleteDocument}
              documentId={docId}
              signed={row.status === "completed"}
            />
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div>
          {canEdit ? (
            <DocumentEditor
              documentId={docId}
              type={type}
              status={row.status}
              formData={(row.formData ?? {}) as Record<string, string>}
              master={{
                vorname: row.vorname ?? "",
                nachname: row.nachname ?? "",
                strasse: row.strasse ?? "",
                plz: row.plz ?? "",
                ort: row.ort ?? "",
                geburtsdatum: row.geburtsdatum ?? "",
                geburtsort: row.geburtsort ?? "",
                phone: row.phone ?? "",
                festnetz: row.festnetz ?? "",
              }}
              participantSigned={!!sheet.signatures.participant}
              hasSignerSignature={!!tenant?.signatureUrl}
              submitAction={submitDocumentEditor}
              role="bildungstraeger"
              signatureHref={`/bildungstraeger/signature?returnTo=/bildungstraeger/courses/${courseId}/dokumente/${docId}`}
              analog={analog}
              confirmAnalogAction={confirmDocumentAnalogAction}
              blankPdfUrl={`/api/bildungstraeger/documents/${docId}/pdf`}
            />
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
              <p className="font-medium text-zinc-900">Verwaltet vom Coach</p>
              <p className="mt-1 text-zinc-600">
                Dieses Dokument ({cfg.formNumber} · {cfg.label}) wird vom Coach
                ausgefüllt und unterschrieben. Du kannst es hier nur ansehen und
                als PDF herunterladen.
              </p>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Vorschau (entspricht dem PDF)
          </p>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
            <DocumentSheet data={sheet} />
          </div>
        </div>
      </div>
    </div>
  );
}

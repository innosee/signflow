import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { DocumentSheet } from "@/components/documents/document-sheet";
import { db, schema } from "@/db";
import { courseVisibleToCoach } from "@/lib/course-access";
import { requireSigningEnabled } from "@/lib/dal";
import { getDocumentConfig, type DocumentTypeId } from "@/lib/documents/config";
import { loadDocumentSheet } from "@/lib/documents/data";
import { DocumentEditor } from "./document-editor";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; docId: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf",
  active: "Wartet auf Teilnehmer:in",
  completed: "Abgeschlossen",
};

export default async function CoachDocumentPage({ params }: Props) {
  const session = await requireSigningEnabled();
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
        courseVisibleToCoach(session.user.id),
      ),
    )
    .limit(1);
  if (!row) notFound();

  const sheet = await loadDocumentSheet(docId);
  if (!sheet) notFound();

  const [coach] = await db
    .select({ signatureUrl: schema.users.signatureUrl })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);

  const cfg = getDocumentConfig(row.type as DocumentTypeId);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/coach/courses/${courseId}`}
            className="text-sm text-zinc-600 underline-offset-2 hover:underline"
          >
            ← zurück zum Kurs
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
            href={`/coach/courses/${courseId}/dokumente/${docId}/print`}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Druckansicht
          </Link>
          <a
            href={`/api/coach/documents/${docId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            PDF
          </a>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div>
          <DocumentEditor
            documentId={docId}
            type={row.type as DocumentTypeId}
            status={row.status}
            formData={(row.formData ?? {}) as Record<string, string>}
            master={{
              vorname: row.vorname ?? "",
              nachname: row.nachname ?? "",
              strasse: row.strasse ?? "",
              plz: row.plz ?? "",
              ort: row.ort ?? "",
              geburtsort: row.geburtsort ?? "",
              phone: row.phone ?? "",
              festnetz: row.festnetz ?? "",
            }}
            participantSigned={!!sheet.signatures.participant}
            hasCoachSignature={!!coach?.signatureUrl}
          />
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

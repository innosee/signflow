import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { DocumentSheet } from "@/components/documents/document-sheet";
import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";
import { loadDocumentSheet } from "@/lib/documents/data";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; docId: string }>;
};

export default async function BildungstraegerDocumentPrintPage({
  params,
}: Props) {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);
  const { id: courseId, docId } = await params;

  // Zugriffs-Gate vor dem Laden (BT darf keine fremd-tenant Dokumente rendern).
  const [owned] = await db
    .select({ id: schema.documents.id })
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
  if (!owned) notFound();

  const sheet = await loadDocumentSheet(docId);
  if (!sheet) notFound();

  return (
    <div className="print-wrapper">
      <div className="print-toolbar" data-print-hide>
        <Link
          href={`/bildungstraeger/courses/${courseId}/dokumente/${docId}`}
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          ← zurück
        </Link>
        <a
          href={`/api/bildungstraeger/documents/${docId}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          PDF herunterladen
        </a>
      </div>

      <DocumentSheet data={sheet} />

      <style>{toolbarCss}</style>
    </div>
  );
}

const toolbarCss = `
  .print-wrapper { background: #f4f4f5; min-height: 100vh; padding: 0 0 8mm 0; }
  .print-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    max-width: 190mm;
    margin: 0 auto;
    padding: 4mm 10mm;
  }
  @media print {
    .print-wrapper { background: #fff; padding: 0; }
    [data-print-hide] { display: none !important; }
  }
`;

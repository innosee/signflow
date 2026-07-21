import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { DocumentSheet } from "@/components/documents/document-sheet";
import { db, schema } from "@/db";
import { loadDocumentSheet } from "@/lib/documents/data";
import { resolveParticipantToken } from "@/lib/participant-tokens";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string; docId: string }>;
};

/**
 * Token-authentifizierte Leseansicht eines Kunde-Dokuments für den Teilnehmer
 * (vor der Unterschrift). Zugriff nur, wenn das Dokument zum Kurs des Magic-
 * Links gehört und vom Coach freigegeben (`active`) bzw. abgeschlossen ist.
 */
export default async function ParticipantDocumentView({ params }: Props) {
  const { token, docId } = await params;
  const resolved = await resolveParticipantToken(token);
  if (!resolved) notFound();

  const [owned] = await db
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.id, docId),
        eq(schema.documents.courseId, resolved.courseId),
        isNull(schema.documents.deletedAt),
      ),
    )
    .limit(1);
  if (!owned) notFound();

  const sheet = await loadDocumentSheet(docId);
  if (!sheet || sheet.status === "draft") notFound();

  return (
    <div className="preview-wrapper">
      <header className="preview-header">
        <Link
          href={`/sign/${token}`}
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          ← zurück
        </Link>
      </header>
      <div className="preview-sheet">
        <DocumentSheet data={sheet} />
      </div>
      <style>{viewCss}</style>
    </div>
  );
}

const viewCss = `
  .preview-wrapper { background: #f4f4f5; min-height: 100vh; padding: 16px 8px 48px; }
  .preview-header { max-width: 800px; margin: 0 auto 16px; padding: 0 8px; }
  .preview-sheet { max-width: 800px; margin: 0 auto; background: #fff; }
  @media (max-width: 820px) { .preview-sheet { overflow-x: auto; } }
`;

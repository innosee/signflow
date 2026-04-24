import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { Stundennachweis } from "@/components/stundennachweis";
import { db, schema } from "@/db";
import { requireSigningEnabled } from "@/lib/dal";
import { loadStundennachweisSheet } from "@/lib/sheet-data";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; participantId: string }>;
};

export default async function PrintSheetPage({ params }: Props) {
  const session = await requireSigningEnabled();
  const { id: courseId, participantId } = await params;

  // Ownership-Gate BEVOR wir das Sheet laden — sonst könnte ein Coach die
  // Nachweise fremder Kurse abfragen. Der Sheet-Helper selbst prüft kein
  // Coach-Scoping, weil er auch vom Teilnehmer-Preview genutzt wird.
  const [owned] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.coachId, session.user.id),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);
  if (!owned) notFound();

  const sheet = await loadStundennachweisSheet({ courseId, participantId });
  if (!sheet) notFound();

  return (
    <div className="print-wrapper">
      <div className="print-toolbar" data-print-hide>
        <Link
          href={`/coach/courses/${courseId}`}
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          ← zurück zum Kurs
        </Link>
        <div className="print-toolbar-actions">
          <a
            href={`/api/courses/${courseId}/participants/${participantId}/pdf`}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            PDF herunterladen
          </a>
          <p className="text-xs text-zinc-500">
            Headless-Chromium rendert dieselbe Seite nach A4 — 1:1 mit dem
            finalen AfA-PDF.
          </p>
        </div>
      </div>

      <Stundennachweis
        course={sheet.course}
        bedarfstraeger={sheet.bedarfstraeger}
        coach={sheet.coach}
        participant={sheet.participant}
        sessions={sheet.sessions}
      />

      <style>{toolbarCss}</style>
    </div>
  );
}

// Toolbar wird im Print-Modus ausgeblendet (AppHeader kommt separat über
// das Coach-Layout und wird durch `print:hidden` Tailwind-Utility versteckt —
// siehe layout.tsx-Anpassung).
const toolbarCss = `
  .print-wrapper { background: #f4f4f5; min-height: 100vh; padding: 0 0 8mm 0; }
  .print-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    max-width: 180mm;
    margin: 0 auto;
    padding: 4mm 10mm;
  }
  .print-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .print-toolbar-actions p { margin: 0; max-width: 30ch; }
  @media print {
    .print-wrapper { background: #fff; padding: 0; }
    [data-print-hide] { display: none !important; }
  }
`;

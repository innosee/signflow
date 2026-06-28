import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { Stundennachweis } from "@/components/stundennachweis";
import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";
import { loadStundennachweisSheet } from "@/lib/sheet-data";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; participantId: string }>;
};

/**
 * Bildungsträger-Sicht des Stundennachweises (= ANW), pixelgleich zur Coach-/
 * Teilnehmer-Vorschau und zum gesiegelten PDF (HTML-as-Source-of-Truth). Eigene
 * Seite, weil der Coach-Print-View coach-scoped ist (`courseVisibleToCoach`) und
 * ein BT dort kein Zugriffsrecht hat — Puppeteer rendert diese Seite mit den
 * BT-Cookies. Gating: Kurs muss zum Tenant des BT gehören (Coach-innerJoin).
 */
export default async function BildungstraegerPrintSheetPage({ params }: Props) {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);
  const { id: courseId, participantId } = await params;

  // Zugriffs-Gate BEVOR wir das Sheet laden (der Sheet-Helper prüft selbst kein
  // Scoping). Tenant-Filter via Coach-innerJoin verhindert das Rendern fremder
  // Nachweise per URL-Manipulation.
  const [owned] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .where(
      and(
        eq(schema.courses.id, courseId),
        eq(schema.users.tenantId, tenantId),
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
          href="/bildungstraeger/courses"
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          ← zurück zu den Kunden
        </Link>
        <div className="print-toolbar-actions">
          <a
            href={`/api/bildungstraeger/courses/${courseId}/anw-pdf`}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            PDF herunterladen
          </a>
          <p className="text-xs text-zinc-500">
            Diese Vorschau entspricht 1:1 dem finalen PDF für die Agentur für
            Arbeit.
          </p>
        </div>
      </div>

      <Stundennachweis
        branding={sheet.branding}
        course={sheet.course}
        bedarfstraeger={sheet.bedarfstraeger}
        coach={sheet.coach}
        participant={sheet.participant}
        sessions={sheet.sessions}
        audit={sheet.audit}
      />

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

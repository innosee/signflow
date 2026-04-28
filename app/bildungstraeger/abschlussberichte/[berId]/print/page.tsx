import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { BerDocument } from "@/components/checker/ber-document";
import { db, schema } from "@/db";
import { requireBildungstraeger } from "@/lib/dal";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ berId: string }>;
};

/**
 * Reine Print-Ansicht des Berichts — keine Toolbar, kein Chrome.
 * Wird vom PDF-Endpoint mit Puppeteer gerendert (`@media print`-Styles
 * der BerDocument-Komponente greifen). Auch direkt im Browser nutzbar
 * (Cmd+P → Save as PDF), Layout ist unverändert.
 */
export default async function BildungstraegerBerPrintPage({ params }: Props) {
  await requireBildungstraeger();
  const { berId } = await params;

  const [row] = await db
    .select({
      teilnahme: schema.abschlussberichte.teilnahme,
      ablauf: schema.abschlussberichte.ablauf,
      fazit: schema.abschlussberichte.fazit,
      status: schema.abschlussberichte.status,
      tnVorname: schema.abschlussberichte.tnVorname,
      tnNachname: schema.abschlussberichte.tnNachname,
      tnKundenNr: schema.abschlussberichte.tnKundenNr,
      tnAvgsNummer: schema.abschlussberichte.tnAvgsNummer,
      tnZeitraum: schema.abschlussberichte.tnZeitraum,
      tnUe: schema.abschlussberichte.tnUe,
      coachNameSnapshot: schema.abschlussberichte.coachNameSnapshot,
      // Fallback für Kurs-gebundene BERs ohne befüllten Snapshot.
      participantName: schema.participants.name,
      participantKundenNr: schema.participants.kundenNr,
      courseTitle: schema.courses.title,
      courseAvgs: schema.courses.avgsNummer,
      courseStart: schema.courses.startDate,
      courseEnd: schema.courses.endDate,
      courseUe: schema.courses.anzahlBewilligteUe,
      coachName: schema.users.name,
    })
    .from(schema.abschlussberichte)
    .leftJoin(
      schema.participants,
      eq(schema.participants.id, schema.abschlussberichte.participantId),
    )
    .leftJoin(
      schema.courses,
      eq(schema.courses.id, schema.abschlussberichte.courseId),
    )
    .leftJoin(
      schema.users,
      eq(schema.users.id, schema.abschlussberichte.coachId),
    )
    .where(eq(schema.abschlussberichte.id, berId))
    .limit(1);

  if (!row || row.status !== "submitted") notFound();

  const teilnehmerName =
    [row.tnVorname, row.tnNachname].filter(Boolean).join(" ").trim() ||
    row.participantName ||
    "";
  const kundenNr = row.tnKundenNr || row.participantKundenNr || "";
  const zeitraum =
    row.tnZeitraum ||
    (row.courseStart && row.courseEnd
      ? `${new Date(row.courseStart).toLocaleDateString("de-DE")} — ${new Date(row.courseEnd).toLocaleDateString("de-DE")}`
      : "");
  const coachName = row.coachName || row.coachNameSnapshot || "";

  return (
    <BerDocument
      input={{
        teilnahme: row.teilnahme,
        ablauf: row.ablauf,
        fazit: row.fazit,
      }}
      meta={{
        avgsMassnahme: row.tnAvgsNummer || row.courseAvgs || "",
        teilnehmerName,
        kundenNr,
        zeitraum,
        coachName,
        gesamtzahlUe:
          row.tnUe ||
          (row.courseUe !== undefined && row.courseUe !== null
            ? String(row.courseUe)
            : ""),
      }}
    />
  );
}

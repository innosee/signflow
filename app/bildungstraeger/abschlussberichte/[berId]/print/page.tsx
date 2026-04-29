import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { BerDocument } from "@/components/checker/ber-document";
import { db, schema } from "@/db";
import { getBranding } from "@/lib/branding";
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
      courseId: schema.abschlussberichte.courseId,
      teilnahme: schema.abschlussberichte.teilnahme,
      ablauf: schema.abschlussberichte.ablauf,
      fazit: schema.abschlussberichte.fazit,
      sonstiges: schema.abschlussberichte.sonstiges,
      keineFehlzeiten: schema.abschlussberichte.keineFehlzeiten,
      mustHaveOverrideReason:
        schema.abschlussberichte.mustHaveOverrideReason,
      status: schema.abschlussberichte.status,
      submittedAt: schema.abschlussberichte.submittedAt,
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
      courseOrt: schema.courses.durchfuehrungsort,
      coachName: schema.users.name,
      coachSignatureUrl: schema.users.signatureUrl,
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

  const branding = await getBranding();

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

  // Signatur + auto-gefülltes "Ort, Datum" nur für kurs-gebundene BERs:
  // Schnell-Check-Submissions sind Ad-hoc ohne Kurs-Kontext, da wäre der
  // Ort frei erfunden — der Coach trägt ihn handschriftlich nach.
  const isAdhoc = row.courseId === null;
  const submittedAtDisplay = row.submittedAt
    ? new Date(row.submittedAt).toLocaleDateString("de-DE")
    : "";
  const ortDatum =
    !isAdhoc && row.courseOrt && submittedAtDisplay
      ? `${row.courseOrt}, ${submittedAtDisplay}`
      : "";

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
        ortDatum,
        coachSignatureUrl: isAdhoc ? null : row.coachSignatureUrl ?? null,
        keineFehlzeiten: row.keineFehlzeiten,
        sonstiges: row.sonstiges,
        mustHaveOverrideReason: row.mustHaveOverrideReason,
      }}
      branding={branding}
    />
  );
}

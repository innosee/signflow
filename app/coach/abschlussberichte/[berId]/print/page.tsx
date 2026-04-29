import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { BerDocument } from "@/components/checker/ber-document";
import { db, schema } from "@/db";
import { getBranding } from "@/lib/branding";
import { requireCoach } from "@/lib/dal";

import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ berId: string }>;
};

/**
 * Coach-eigene Print-Ansicht des BER. Owner-Check verhindert, dass ein
 * Coach BERs anderer Coaches einsehen kann (siehe `coach_id`-Filter).
 * Reine Print-Ansicht — Toolbar nur im Bildschirm-Modus, im Print-CSS
 * versteckt. Öffnet sich i.d.R. nach „Einreichen + PDF" oder via Link
 * aus der Berichts-Übersicht.
 */
export default async function CoachBerPrintPage({ params }: Props) {
  const session = await requireCoach();
  const { berId } = await params;

  const [row] = await db
    .select({
      ber: {
        id: schema.abschlussberichte.id,
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
      },
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
    .where(
      and(
        eq(schema.abschlussberichte.id, berId),
        // Owner-Check: nur eigene Berichte
        eq(schema.abschlussberichte.coachId, session.user.id),
      ),
    )
    .limit(1);

  if (!row) notFound();
  const { ber } = row;

  const branding = await getBranding();

  const teilnehmerName =
    [ber.tnVorname, ber.tnNachname].filter(Boolean).join(" ").trim() ||
    row.participantName ||
    "";
  const kundenNr = ber.tnKundenNr || row.participantKundenNr || "";
  const zeitraum =
    ber.tnZeitraum ||
    (row.courseStart && row.courseEnd
      ? `${new Date(row.courseStart).toLocaleDateString("de-DE")} — ${new Date(row.courseEnd).toLocaleDateString("de-DE")}`
      : "");
  const coachName = row.coachName || ber.coachNameSnapshot || "";

  // Schnell-Check (kein Kurs) → keine Coach-Signatur, leeres Ort/Datum.
  // Kurs-gebundener BER → Signatur + Ort/Datum aus durchfuehrungsort + submittedAt.
  const isAdhoc = ber.courseId === null;
  const submittedAtDisplay = ber.submittedAt
    ? new Date(ber.submittedAt).toLocaleDateString("de-DE")
    : "";
  const ortDatum =
    !isAdhoc && row.courseOrt && submittedAtDisplay
      ? `${row.courseOrt}, ${submittedAtDisplay}`
      : "";

  return (
    <div className="coach-print-wrapper">
      <div className="coach-print-toolbar" data-print-hide>
        <Link
          href="/coach/checker"
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          ← zurück zur Berichts-Übersicht
        </Link>
        <div className="coach-print-toolbar-actions">
          <p className="text-xs text-zinc-500">
            Klick &bdquo;Als PDF speichern&ldquo; öffnet den Druckdialog —
            dort Ziel &bdquo;Als PDF speichern&ldquo; wählen.
          </p>
          <PrintButton />
        </div>
      </div>

      <div className="coach-print-canvas">
        <BerDocument
          input={{
            teilnahme: ber.teilnahme,
            ablauf: ber.ablauf,
            fazit: ber.fazit,
          }}
          meta={{
            avgsMassnahme: ber.tnAvgsNummer || row.courseAvgs || "",
            teilnehmerName,
            kundenNr,
            zeitraum,
            coachName,
            gesamtzahlUe:
              ber.tnUe ||
              (row.courseUe !== undefined && row.courseUe !== null
                ? String(row.courseUe)
                : ""),
            ortDatum,
            coachSignatureUrl: isAdhoc ? null : row.coachSignatureUrl ?? null,
            keineFehlzeiten: ber.keineFehlzeiten,
            sonstiges: ber.sonstiges,
            mustHaveOverrideReason: ber.mustHaveOverrideReason,
          }}
          branding={branding}
        />
      </div>

      <style>{toolbarCss}</style>
    </div>
  );
}

const toolbarCss = `
  .coach-print-wrapper {
    background: #f4f4f5;
    min-height: 100vh;
    padding: 0 0 8mm 0;
  }
  .coach-print-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    max-width: 210mm;
    margin: 0 auto;
    padding: 4mm 10mm;
  }
  .coach-print-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .coach-print-toolbar-actions p {
    margin: 0;
    max-width: 40ch;
    text-align: right;
  }
  .coach-print-canvas {
    max-width: 210mm;
    margin: 0 auto;
    background: white;
    box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  }
  @media print {
    .coach-print-wrapper {
      background: #fff;
      padding: 0;
    }
    .coach-print-canvas {
      box-shadow: none;
      max-width: none;
    }
    [data-print-hide] {
      display: none !important;
    }
  }
`;

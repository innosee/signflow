import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, or } from "drizzle-orm";

import { BerDocument } from "@/components/checker/ber-document";
import { db, schema } from "@/db";
import { getBranding } from "@/lib/branding";
import { courseVisibleToCoach } from "@/lib/course-access";
import { getTenantId, requireCoach } from "@/lib/dal";
import { formatDateDE } from "@/lib/format-date";
import { signaturOrt } from "@/lib/signatur-ort";
import { resolveAssetUrl } from "@/lib/storage";

import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ berId: string }>;
};

/**
 * Coach-Print-Ansicht des BER. Zugriff hat der Autor des Berichts ODER —
 * bei kurs-gebundenen Berichten — jeder Coach im Kompetenzteam des Kurses
 * (`courseVisibleToCoach` greift auf den gejointen `schema.courses`). Ad-hoc-
 * Berichte (ohne `course_id`) bleiben rein Autor-eigen. Reine Print-Ansicht —
 * Toolbar nur im Bildschirm-Modus, im Print-CSS versteckt. Öffnet sich i.d.R.
 * nach „Einreichen + PDF" oder via Link aus der Berichts-Übersicht.
 */
export default async function CoachBerPrintPage({ params }: Props) {
  const session = await requireCoach();
  const tenantId = getTenantId(session);
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
        abschlussDatum: schema.abschlussberichte.abschlussDatum,
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
        // Autor ODER Team-Coach des kurs-gebundenen Berichts. Bei ad-hoc-
        // Berichten (courseId null) ist der gejointe Kurs NULL → nur der Autor.
        or(
          eq(schema.abschlussberichte.coachId, session.user.id),
          courseVisibleToCoach(session.user.id),
        ),
      ),
    )
    .limit(1);

  if (!row) notFound();
  const { ber } = row;

  const [branding, coachSignatureUrl] = await Promise.all([
    getBranding(tenantId),
    resolveAssetUrl(row.coachSignatureUrl),
  ]);

  const teilnehmerName =
    [ber.tnVorname, ber.tnNachname].filter(Boolean).join(" ").trim() ||
    row.participantName ||
    "";
  const kundenNr = ber.tnKundenNr || row.participantKundenNr || "";
  // Snapshot gewinnt (eingereichte Berichte). Für Entwürfe ohne Snapshot:
  // Kurs-Start bis Abschlussdatum (= letzter Termin, überschreibbar), sonst
  // Bewilligungsende als Fallback.
  const zeitraumEnde = ber.abschlussDatum ?? row.courseEnd ?? null;
  const zeitraum =
    ber.tnZeitraum ||
    (row.courseStart && zeitraumEnde
      ? `${formatDateDE(row.courseStart)} — ${formatDateDE(zeitraumEnde)}`
      : "");
  const coachName = row.coachName || ber.coachNameSnapshot || "";

  // Schnell-Check (kein Kurs) → keine Coach-Signatur, leeres Ort/Datum.
  // Kurs-gebundener BER → Signatur + Ort/Datum aus durchfuehrungsort.
  // Datum: eingereicht → submittedAt; Entwurf-Download → heute (sonst bliebe
  // die „Ort, Datum"-Zeile leer). Ort wird vorangestellt, wenn vorhanden.
  const isAdhoc = ber.courseId === null;
  const datumDisplay = isAdhoc
    ? ""
    : formatDateDE(ber.submittedAt ?? new Date());
  // Nur der Ort (Stadt) gehört in die „Ort, Datum"-Signaturzeile — nicht die
  // volle Anschrift mit Straße/PLZ (siehe signaturOrt).
  const ortDatum = !isAdhoc
    ? [signaturOrt(row.courseOrt), datumDisplay].filter(Boolean).join(", ")
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
            coachSignatureUrl: isAdhoc ? null : coachSignatureUrl,
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

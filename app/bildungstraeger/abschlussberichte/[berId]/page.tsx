import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { BerDocument } from "@/components/checker/ber-document";
import { db, schema } from "@/db";
import { getBranding } from "@/lib/branding";
import { requireBildungstraeger } from "@/lib/dal";
import { readSoftFlags } from "@/lib/checker/snapshot";
import {
  VIOLATION_CATEGORY_LABELS,
  type CheckerSection,
} from "@/lib/checker/types";

import { acknowledgeSoftFlags } from "../../actions";
import { PrintButton } from "./print-toolbar";

const SECTION_LABELS: Record<CheckerSection, string> = {
  teilnahme: "Teilnahme und Mitarbeit",
  ablauf: "Ablauf und Inhalte",
  fazit: "Fazit und Empfehlungen",
};

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ berId: string }>;
};

export default async function BildungstraegerBerDetailPage({ params }: Props) {
  await requireBildungstraeger();
  const { berId } = await params;

  const [row] = await db
    .select({
      ber: {
        id: schema.abschlussberichte.id,
        teilnahme: schema.abschlussberichte.teilnahme,
        ablauf: schema.abschlussberichte.ablauf,
        fazit: schema.abschlussberichte.fazit,
        status: schema.abschlussberichte.status,
        submittedAt: schema.abschlussberichte.submittedAt,
        updatedAt: schema.abschlussberichte.updatedAt,
        lastCheckPassed: schema.abschlussberichte.lastCheckPassed,
        checkSnapshot: schema.abschlussberichte.checkSnapshot,
        softFlagsAcknowledgedAt:
          schema.abschlussberichte.softFlagsAcknowledgedAt,
        // Snapshot-Spalten — für Ad-hoc-BERs ist das die einzige Quelle
        // der TN-Daten (course/participant sind null). Auch für Kurs-
        // gebundene Rows nach Backfill verfügbar.
        tnVorname: schema.abschlussberichte.tnVorname,
        tnNachname: schema.abschlussberichte.tnNachname,
        tnKundenNr: schema.abschlussberichte.tnKundenNr,
        tnAvgsNummer: schema.abschlussberichte.tnAvgsNummer,
        tnZeitraum: schema.abschlussberichte.tnZeitraum,
        tnUe: schema.abschlussberichte.tnUe,
        coachNameSnapshot: schema.abschlussberichte.coachNameSnapshot,
      },
      course: {
        id: schema.courses.id,
        title: schema.courses.title,
        avgsNummer: schema.courses.avgsNummer,
        startDate: schema.courses.startDate,
        endDate: schema.courses.endDate,
        anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
        durchfuehrungsort: schema.courses.durchfuehrungsort,
      },
      participant: {
        id: schema.participants.id,
        name: schema.participants.name,
        kundenNr: schema.participants.kundenNr,
        email: schema.participants.email,
      },
      coach: {
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        signatureUrl: schema.users.signatureUrl,
      },
    })
    .from(schema.abschlussberichte)
    // leftJoin statt innerJoin: Ad-hoc-BERs haben courseId/participantId
    // null und würden sonst gar nicht erst in der Ergebnismenge landen.
    .leftJoin(
      schema.courses,
      eq(schema.courses.id, schema.abschlussberichte.courseId),
    )
    .leftJoin(
      schema.participants,
      eq(schema.participants.id, schema.abschlussberichte.participantId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.abschlussberichte.coachId))
    .where(eq(schema.abschlussberichte.id, berId))
    .limit(1);

  if (!row) notFound();

  const { ber, course, participant, coach } = row;
  const branding = await getBranding();
  const softFlags = readSoftFlags(ber.checkSnapshot);
  const softFlagsAcknowledged = !!ber.softFlagsAcknowledgedAt;
  const ackDate = ber.softFlagsAcknowledgedAt
    ? new Date(ber.softFlagsAcknowledgedAt)
    : null;

  // Drafts sind bewusst nicht einsehbar — nur eingereichte BERs haben den
  // AMDL-Gate durchlaufen und sind für die Bildungsträgerin freigegeben.
  if (ber.status !== "submitted") notFound();
  const submittedAt = ber.submittedAt ? new Date(ber.submittedAt) : null;
  const updatedAt = ber.updatedAt ? new Date(ber.updatedAt) : null;
  const wasEditedAfterSubmit =
    submittedAt &&
    updatedAt &&
    updatedAt.getTime() - submittedAt.getTime() > 60_000;

  // Display-Werte mit Fallback: bei Ad-hoc-BERs gibt es kein course/
  // participant — wir nutzen die denormalisierten Snapshot-Spalten.
  const isAdhoc = course === null;
  const tnDisplayName =
    [ber.tnVorname, ber.tnNachname].filter(Boolean).join(" ").trim() ||
    participant?.name ||
    "—";
  const tnKundenNr = ber.tnKundenNr || participant?.kundenNr || "";
  const courseTitle = course?.title ?? "Schnell-Check (ad-hoc)";
  const backHref = course
    ? `/bildungstraeger/courses/${course.id}/berichte`
    : `/bildungstraeger/abschlussberichte`;
  const backLabel = course
    ? "← zurück zur Kurs-Übersicht"
    : "← zurück zur Berichts-Liste";
  const zeitraumDisplay =
    ber.tnZeitraum ||
    (course?.startDate && course?.endDate
      ? `${course.startDate} – ${course.endDate}`
      : "");
  const ueDisplay =
    ber.tnUe ||
    (course?.anzahlBewilligteUe !== undefined &&
    course?.anzahlBewilligteUe !== null
      ? String(course.anzahlBewilligteUe)
      : "");
  const avgsDisplay = ber.tnAvgsNummer || course?.avgsNummer || "";

  return (
    <div className="review-wrapper">
      <div className="review-toolbar" data-print-hide>
        <div className="min-w-0">
          <Link
            href={backHref}
            className="text-xs text-zinc-500 hover:text-zinc-900"
          >
            {backLabel}
          </Link>
          <h1 className="mt-1 truncate text-lg font-semibold">
            BER · {tnDisplayName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span>{courseTitle}</span>
            {isAdhoc && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                Schnell-Check
              </span>
            )}
            <span>·</span>
            <span>Coach: {coach.name}</span>
            {tnKundenNr && (
              <>
                <span>·</span>
                <span>Kd-Nr. {tnKundenNr}</span>
              </>
            )}
            {ber.status === "submitted" ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                ✓ eingereicht
                {submittedAt
                  ? ` am ${submittedAt.toLocaleDateString("de-DE")}`
                  : ""}
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                Entwurf
              </span>
            )}
            {ber.lastCheckPassed && (
              <span
                title="Die finale AMDL-Regelprüfung wurde beim Einreichen bestanden."
                className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700"
              >
                AMDL-Check ✓
              </span>
            )}
            {wasEditedAfterSubmit && (
              <span
                title={`Zuletzt bearbeitet am ${updatedAt?.toLocaleString("de-DE")}`}
                className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800"
              >
                nach Einreichung bearbeitet
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <PrintButton />
        </div>
      </div>

      {softFlags.length > 0 && (
        <section
          className="review-soft-flags"
          data-print-hide
          aria-label="Formulierungs-Hinweise des Checkers"
        >
          <div className="review-soft-flags-inner">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-amber-900">
                  Formulierungs-Hinweise ({softFlags.length})
                </h2>
                <p className="mt-0.5 text-xs text-amber-800/80">
                  {softFlagsAcknowledged
                    ? `Vom Bildungsträger akzeptiert${ackDate ? ` am ${ackDate.toLocaleString("de-DE")}` : ""}.`
                    : "Der Coach hat diese Hinweise gesehen und den Bericht trotzdem eingereicht. Bitte prüfen und ggf. freigeben."}
                </p>
              </div>
              {!softFlagsAcknowledged && (
                <form action={acknowledgeSoftFlags}>
                  <input type="hidden" name="berId" value={ber.id} />
                  <button
                    type="submit"
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700"
                  >
                    Freigeben trotz Hinweisen
                  </button>
                </form>
              )}
              {softFlagsAcknowledged && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                  ✓ freigegeben
                </span>
              )}
            </header>
            <ul className="mt-3 space-y-2">
              {softFlags.map((v, idx) => (
                <li
                  key={`${v.id ?? idx}`}
                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-900">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium">
                      {VIOLATION_CATEGORY_LABELS[v.category] ?? v.category}
                    </span>
                    <span className="text-amber-800/70">
                      {SECTION_LABELS[v.section] ?? v.section}
                    </span>
                    <span className="text-amber-800/70">· {v.rule}</span>
                  </div>
                  <blockquote className="mt-1.5 italic text-zinc-800">
                    &bdquo;{v.quote}&ldquo;
                  </blockquote>
                  {v.suggestion && (
                    <p className="mt-1 text-zinc-700">
                      <span className="font-medium text-emerald-800">
                        Vorschlag:
                      </span>{" "}
                      {v.suggestion}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="review-canvas">
        <BerDocument
          input={{
            teilnahme: ber.teilnahme,
            ablauf: ber.ablauf,
            fazit: ber.fazit,
          }}
          meta={{
            avgsMassnahme: avgsDisplay || courseTitle,
            teilnehmerName: tnDisplayName,
            kundenNr: tnKundenNr,
            zeitraum: zeitraumDisplay,
            coachName: coach.name,
            gesamtzahlUe: ueDisplay,
            // Schnell-Check: kein Ort/Datum (Coach trägt handschriftlich ein)
            // und keine digitale Coach-Signatur. Kurs-gebundene BERs:
            // Ort = `courses.durchfuehrungsort`, Datum = `submitted_at`.
            ortDatum:
              !isAdhoc && course?.durchfuehrungsort && submittedAt
                ? `${course.durchfuehrungsort}, ${submittedAt.toLocaleDateString("de-DE")}`
                : "",
            coachSignatureUrl: isAdhoc ? null : coach.signatureUrl ?? null,
          }}
          branding={branding}
        />
      </div>

      <style>{toolbarCss}</style>
    </div>
  );
}

const toolbarCss = `
  .review-wrapper {
    background: #f4f4f5;
    min-height: 100vh;
    padding: 0 0 10mm 0;
  }
  .review-toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    max-width: 210mm;
    margin: 0 auto;
    padding: 5mm 10mm 6mm;
  }
  .review-canvas {
    max-width: 210mm;
    margin: 0 auto;
    background: white;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  }
  .review-soft-flags {
    max-width: 210mm;
    margin: 0 auto 6mm;
    padding: 0 10mm;
  }
  .review-soft-flags-inner {
    border: 1px solid #fcd34d;
    background: #fffbeb;
    border-radius: 10px;
    padding: 14px 16px;
  }
  @media print {
    .review-wrapper {
      background: white;
      padding: 0;
    }
    .review-canvas {
      max-width: none;
      box-shadow: none;
    }
    [data-print-hide] {
      display: none !important;
    }
  }
`;

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { isImpersonating, requireSigningEnabled } from "@/lib/dal";
import { courseVisibleToCoach } from "@/lib/course-access";
import { isFutureSessionDate } from "@/lib/dates";
import { getFeiertag } from "@/lib/feiertage";
import { isSmsEnabled } from "@/lib/sms";

import { AutoRefresh } from "@/components/auto-refresh";
import { ReviewThread } from "@/components/review-thread";

import { AnwCheckButton } from "./anw-check-button";
import { CoachSignForm } from "./coach-sign-form";
import { CorrectTopicButton } from "./correct-topic-button";
import { MarkAbgeschlossenButton } from "./mark-abgeschlossen-button";
import { NotifyParticipantsButton } from "./notify-button";
import { SendPreviewButton } from "./preview-button";
import { QrHandoverButton } from "./qr-handover-button";
import { ReopenSessionButton } from "./reopen-session-button";
import { ReviewSubmitButton } from "./review-submit-button";
import { SealCourseButton } from "./seal-button";
import { SmsResendButton } from "./sms-resend-button";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reused?: string }>;
};

const BEDARFSTRAEGER_LABEL = {
  JC: "Jobcenter",
  AA: "Arbeitsagentur",
} as const;

export default async function CourseDetailPage({ params, searchParams }: Props) {
  const session = await requireSigningEnabled();
  const impersonating = isImpersonating(session);
  const { id } = await params;
  const { reused } = await searchParams;

  // reused kommt als beliebiger String aus der URL — nur rendern, wenn
  // es eine positive Ganzzahl ist. Verhindert, dass z.B. ?reused=abc
  // einen unsinnigen Banner erzeugt.
  const reusedCount = reused ? Number.parseInt(reused, 10) : NaN;
  const showReusedBanner = Number.isFinite(reusedCount) && reusedCount > 0;

  // Data-Isolation serverseitig (Kompetenzteams): Coach sieht die Maßnahme,
  // wenn er Lead ODER mind. einem Termin zugewiesen ist.
  const [course] = await db
    .select({
      id: schema.courses.id,
      coachId: schema.courses.coachId,
      title: schema.courses.title,
      avgsNummer: schema.courses.avgsNummer,
      durchfuehrungsort: schema.courses.durchfuehrungsort,
      anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
      bundesland: schema.courses.bundesland,
      startDate: schema.courses.startDate,
      endDate: schema.courses.endDate,
      flagVorzeitigesEnde: schema.courses.flagVorzeitigesEnde,
      begruendungText: schema.courses.begruendungText,
      anwCheckPassedAt: schema.courses.anwCheckPassedAt,
      abgeschlossenAt: schema.courses.abgeschlossenAt,
      reviewStatus: schema.courses.reviewStatus,
      reviewRequestedAt: schema.courses.reviewRequestedAt,
      reviewDecidedAt: schema.courses.reviewDecidedAt,
      bedarfstraegerName: schema.bedarfstraeger.name,
      bedarfstraegerType: schema.bedarfstraeger.type,
    })
    .from(schema.courses)
    .innerJoin(
      schema.bedarfstraeger,
      eq(schema.bedarfstraeger.id, schema.courses.bedarfstraegerId),
    )
    .where(
      and(
        eq(schema.courses.id, id),
        isNull(schema.courses.deletedAt),
        courseVisibleToCoach(session.user.id),
      ),
    )
    .limit(1);

  if (!course) notFound();

  // Kompetenzteam: JEDER Team-Coach darf alle Schritte auslösen (kein Lead-
  // Sonderrecht). Die Seite lädt ohnehin nur, wenn der Coach im Team ist
  // (courseVisibleToCoach). `canManage` = nicht unter Impersonation (schreibende
  // Aktionen bleiben während Impersonation hart blockiert). Signieren ist
  // termin-gebunden (nur der eigene Termin) — siehe `canSignThis` unten.
  const canManage = !impersonating;

  const [me] = await db
    .select({ signatureUrl: schema.users.signatureUrl })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
  const coachHasSignature = !!me?.signatureUrl;

  const participants = await db
    .select({
      id: schema.participants.id,
      name: schema.participants.name,
      email: schema.participants.email,
      phone: schema.participants.phone,
      kundenNr: schema.participants.kundenNr,
    })
    .from(schema.courses)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(eq(schema.courses.id, id))
    .orderBy(asc(schema.participants.name));

  // SMS ist Coach-getriggert per-TN (siehe SmsResendButton), nicht Bulk.
  // Feature-Gate steuert nur, ob der Per-TN-Button überhaupt erscheint.
  const smsEnabled = isSmsEnabled();

  // Termine + aggregierte Signatur-Counts pro Termin. 1:1: jeder Termin gehört
  // dem einen Kunden, also "Coach ✓ · 0/1 TN". DISTINCT-Count, weil der
  // signatures-leftJoin Rows ausmultipliziert.
  const sessions = await db
    .select({
      id: schema.sessions.id,
      sessionDate: schema.sessions.sessionDate,
      anzahlUe: schema.sessions.anzahlUe,
      modus: schema.sessions.modus,
      isErstgespraech: schema.sessions.isErstgespraech,
      topic: schema.sessions.topic,
      status: schema.sessions.status,
      // Kompetenzteams: zugewiesener Coach des Termins (+ Name für die Anzeige).
      coachId: schema.sessions.coachId,
      coachName: schema.users.name,
      coachSigned: sql<number>`count(distinct ${schema.signatures.id}) filter (where ${schema.signatures.signerType} = 'coach')::int`,
      participantsSigned: sql<number>`count(distinct ${schema.signatures.id}) filter (where ${schema.signatures.signerType} = 'participant')::int`,
    })
    .from(schema.sessions)
    .leftJoin(
      schema.signatures,
      eq(schema.signatures.sessionId, schema.sessions.id),
    )
    .leftJoin(schema.users, eq(schema.users.id, schema.sessions.coachId))
    .where(
      and(
        eq(schema.sessions.courseId, id),
        isNull(schema.sessions.deletedAt),
      ),
    )
    .groupBy(schema.sessions.id, schema.users.name)
    .orderBy(asc(schema.sessions.sessionDate));

  // Mehrere Coaches im Spiel? Dann zeigen wir pro Termin, wer zugewiesen ist.
  const distinctCoachIds = new Set(
    sessions.map((s) => s.coachId).filter((v): v is string => v !== null),
  );
  const isKompetenzteam = distinctCoachIds.size > 1;

  // "Geleistet" zählt nur Sessions, bei denen Coach UND alle Teilnehmer
  // signiert haben (status='completed'). Reine Coach-Signatur oder noch
  // offene Sessions zählen nicht — sonst würde der Fortschritt gegenüber
  // der AfA-Bewilligung optimistisch verfälscht.
  const geleisteteUe = sessions
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + Number.parseFloat(s.anzahlUe), 0);

  // Freigabe-Status pro Teilnehmer: Map<participantId, approvedAt>.
  // Wird unten für das "Abschluss"-Panel gebraucht, damit der Coach auf
  // einen Blick sieht, wer den Preview noch freigeben muss.
  const approvedRows = participants.length
    ? await db
        .select({
          participantId: schema.participantApprovals.participantId,
          approvedAt: schema.participantApprovals.approvedAt,
        })
        .from(schema.participantApprovals)
        .where(
          and(
            eq(schema.participantApprovals.courseId, id),
            inArray(
              schema.participantApprovals.participantId,
              participants.map((p) => p.id),
            ),
          ),
        )
    : [];
  const approvalByParticipant = new Map<string, Date>(
    approvedRows.map((r) => [r.participantId, r.approvedAt]),
  );

  const berRows = participants.length
    ? await db
        .select({
          participantId: schema.abschlussberichte.participantId,
          status: schema.abschlussberichte.status,
          submittedAt: schema.abschlussberichte.submittedAt,
          updatedAt: schema.abschlussberichte.updatedAt,
        })
        .from(schema.abschlussberichte)
        .where(eq(schema.abschlussberichte.courseId, id))
    : [];
  const berByParticipant = new Map(
    berRows.map((r) => [r.participantId, r]),
  );

  const [finalDoc] = await db
    .select({
      fesStatus: schema.finalDocuments.fesStatus,
      pdfUrl: schema.finalDocuments.pdfUrl,
      completedAt: schema.finalDocuments.completedAt,
      afaStatus: schema.finalDocuments.afaStatus,
      submittedToAfaAt: schema.finalDocuments.submittedToAfaAt,
    })
    .from(schema.finalDocuments)
    .where(eq(schema.finalDocuments.courseId, id))
    .limit(1);

  // Notiz-Thread der BT-Prüfung (Coach ↔ Bildungsträger), chronologisch.
  // Autor-Name zur Anzeige direkt mitjoinen.
  const reviewNotes = await db
    .select({
      id: schema.courseReviewNotes.id,
      authorType: schema.courseReviewNotes.authorType,
      authorName: schema.users.name,
      kind: schema.courseReviewNotes.kind,
      body: schema.courseReviewNotes.body,
      createdAt: schema.courseReviewNotes.createdAt,
    })
    .from(schema.courseReviewNotes)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.courseReviewNotes.authorId),
    )
    .where(eq(schema.courseReviewNotes.courseId, id))
    .orderBy(asc(schema.courseReviewNotes.createdAt));

  const allSessionsCompleted =
    sessions.length > 0 && sessions.every((s) => s.status === "completed");
  const allApproved =
    participants.length > 0 &&
    participants.every((p) => approvalByParticipant.has(p.id));
  const previewSent = approvedRows.length > 0; // heuristic; we don't track sent separately
  const isSealed = finalDoc?.fesStatus === "completed";

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-8">
      {/* Polling-Refresh damit TN-Signaturen live reinkommen ohne F5 */}
      <AutoRefresh />
      {showReusedBanner && (
        <div
          role="status"
          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"
        >
          Hinweis: {reusedCount} Teilnehmer existierten bereits in Signflow —
          die bestehenden Datensätze wurden wiederverwendet (Name und
          Kunden-Nr. bleiben unverändert).
        </div>
      )}

      <header className="space-y-2">
        {/* 1:1: Genau ein Kunde pro Kurs. Kundenname als Überschrift für die
            Zuordnung, Kurs-Titel als Subline darunter. */}
        <h1 className="text-2xl font-semibold tracking-tight">
          {participants[0]?.name ?? course.title}
        </h1>
        {participants[0] && (
          <p className="text-base text-zinc-700">{course.title}</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
          <span>AVGS {course.avgsNummer}</span>
          <span>{course.durchfuehrungsort}</span>
          <span>
            {course.bedarfstraegerName} (
            {BEDARFSTRAEGER_LABEL[course.bedarfstraegerType] ??
              course.bedarfstraegerType}
            )
          </span>
          <span>
            {formatDate(course.startDate)} bis {formatDate(course.endDate)}
          </span>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Bewilligte UE" value={`${course.anzahlBewilligteUe}`} />
        <Stat
          label="Geleistete UE"
          value={geleisteteUe.toString().replace(".", ",")}
        />
        <Stat label="Sessions" value={sessions.length.toString()} />
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-300 px-6 py-4">
          <h2 className="text-lg font-semibold">
            Termine ({sessions.length})
          </h2>
          {/* Jeder Team-Coach darf Termine anlegen (für sich selbst). */}
          {impersonating ? (
            <span
              title="Während Impersonation nicht möglich"
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white opacity-40"
            >
              + Termin anlegen
            </span>
          ) : (
            <Link
              href={`/coach/courses/${course.id}/sessions/new`}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              + Termin anlegen
            </Link>
          )}
        </div>
        {sessions.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            Noch keine Termine. Lege den ersten an.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 text-sm">
            {sessions.map((s) => {
              const coachSigned = s.coachSigned > 0;
              // 1:1: Jeder Termin gehört genau dem einen Kunden des Kurses.
              const tnTotal = 1;
              const tnSigned = s.participantsSigned;
              // Kompetenzteam: NUR der zugewiesene Coach darf diesen Termin
              // signieren (Alt-Termine ohne Zuweisung: der primäre Coach des
              // Kurses). Spiegelt das harte Server-Gate in signSessionAsCoach.
              const assignedToMe =
                s.coachId === session.user.id ||
                (s.coachId === null && course.coachId === session.user.id);
              const canSignThis = assignedToMe && !impersonating;
              // Zukunfts-Termine sind noch nicht signierbar.
              const isFuture = isFutureSessionDate(s.sessionDate);
              // Feiertag im Bundesland des Kunden? Nur Markierung — Coaching an
              // einem Feiertag ist die Ausnahme, aber nicht verboten.
              const feiertag = getFeiertag(s.sessionDate, course.bundesland);
              return (
                <li key={s.id} className="px-6 py-4 space-y-2">
                  <div className="flex items-start gap-4">
                    <div className="w-24 shrink-0">
                      <div className="font-medium">{s.sessionDate}</div>
                      <div className="text-xs text-zinc-500">
                        {s.modus === "online" ? "Online" : "Präsenz"}
                        {" · "}
                        {s.isErstgespraech ? "Erstgespräch" : `${s.anzahlUe} UE`}
                      </div>
                      {feiertag && (
                        <span
                          title={`${feiertag} — Coaching an Feiertagen ist die Ausnahme`}
                          className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                        >
                          🎌 {feiertag}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <p className="text-zinc-700">{s.topic}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <SessionStatusBadge status={s.status} />
                        {isKompetenzteam && s.coachName && (
                          <span
                            className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-800"
                            title="Diesem Termin zugewiesener Coach"
                          >
                            {s.coachName}
                          </span>
                        )}
                        <span>
                          Coach {coachSigned ? "✓" : "–"}
                        </span>
                        <span>
                          TN {tnSigned}/{tnTotal}
                        </span>
                        {canManage &&
                          !coachSigned &&
                          tnSigned === 0 && (
                            <Link
                              href={`/coach/courses/${course.id}/sessions/${s.id}/edit`}
                              className="text-zinc-700 underline-offset-2 hover:underline"
                            >
                              Bearbeiten
                            </Link>
                          )}
                        {canManage && (coachSigned || tnSigned > 0) && (
                          <CorrectTopicButton
                            courseId={course.id}
                            sessionId={s.id}
                            topic={s.topic}
                          />
                        )}
                        {canManage && (coachSigned || tnSigned > 0) && (
                          <ReopenSessionButton
                            courseId={course.id}
                            sessionId={s.id}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Kompetenzteams: nur der dem Termin zugewiesene Coach
                      signiert (Lead-Fallback für Alt-Termine ohne Zuweisung). */}
                  {!coachSigned && canSignThis && coachHasSignature && (
                    <div className="pl-28">
                      {isFuture ? (
                        <p className="text-xs text-zinc-500">
                          Termin liegt in der Zukunft — signierbar ab dem
                          Termindatum.
                        </p>
                      ) : (
                        <CoachSignForm courseId={course.id} sessionId={s.id} />
                      )}
                    </div>
                  )}
                  {!coachSigned && canSignThis && !coachHasSignature && (
                    <p className="pl-28 text-xs text-amber-700">
                      Zum Signieren bitte zuerst{" "}
                      <Link
                        href="/coach/signature"
                        className="underline-offset-2 hover:underline"
                      >
                        Unterschrift anlegen
                      </Link>
                      .
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Abschluss-Workflow (Gates → FES): jeder Team-Coach darf ihn auslösen. */}
      <section className="rounded-xl border border-zinc-300 bg-white">
        <div className="border-b border-zinc-300 px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Abschluss</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Wenn alle Termine signiert sind, sende dem Teilnehmer die
                Vorschau. Nach dessen Freigabe versiegelst du das Dokument mit
                FES und übergibst es an deinen Bildungsträger zur Übermittlung
                an die Agentur für Arbeit.
              </p>
            </div>
            {participants.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {participants.map((p) => (
                  <Link
                    key={p.id}
                    href={`/coach/courses/${course.id}/print/${p.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition hover:bg-zinc-50"
                    title={`PDF-Vorschau für ${p.name}`}
                  >
                    <span aria-hidden="true">📄</span> PDF: {p.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="divide-y divide-zinc-200">
          <Step
            index={1}
            title="Termine vollständig signiert"
            done={allSessionsCompleted}
            subtitle={
              allSessionsCompleted
                ? "Alle Termine von Coach und Teilnehmer bestätigt."
                : `${sessions.filter((s) => s.status === "completed").length} von ${sessions.length} vollständig.`
            }
          />
          <Step
            index={2}
            title="ANW-Compliance-Check"
            done={!!course.anwCheckPassedAt}
            subtitle={
              course.anwCheckPassedAt
                ? `Freigegeben am ${new Date(course.anwCheckPassedAt).toLocaleString("de-DE")}.`
                : "KI-Prüfung der Stichwort-Einträge gegen AZAV-Vorgaben."
            }
          >
            {!impersonating && (
              <AnwCheckButton
                courseId={course.id}
                disabled={sessions.length === 0}
                disabledReason={
                  sessions.length === 0
                    ? "Erst Termine anlegen, dann prüfen"
                    : undefined
                }
              />
            )}
          </Step>
          <Step
            index={3}
            title="Maßnahme als abgeschlossen markieren"
            done={!!course.abgeschlossenAt}
            subtitle={
              course.abgeschlossenAt
                ? `Abgeschlossen am ${new Date(course.abgeschlossenAt).toLocaleString("de-DE")}.`
                : `${geleisteteUe.toString().replace(".", ",")} von ${course.anzahlBewilligteUe} UE geleistet. Coach-Bestätigung nötig: keine weiteren Termine kommen mehr.`
            }
          >
            {!impersonating && !course.abgeschlossenAt && (
              <MarkAbgeschlossenButton
                courseId={course.id}
                geleisteteUe={geleisteteUe}
                bewilligteUe={course.anzahlBewilligteUe}
              />
            )}
          </Step>
          <Step
            index={4}
            title="Freigabe der Teilnehmer einholen"
            done={allApproved}
            subtitle={
              participants.length === 0
                ? "Noch keine Teilnehmer im Kurs."
                : !course.abgeschlossenAt
                  ? "Erst nach Markierung als abgeschlossen möglich."
                  : `${approvalByParticipant.size} von ${participants.length} Teilnehmern haben freigegeben.`
            }
          >
            {!impersonating && (
              <SendPreviewButton
                courseId={course.id}
                disabled={
                  participants.length === 0 ||
                  !allSessionsCompleted ||
                  !course.anwCheckPassedAt ||
                  !course.abgeschlossenAt ||
                  allApproved
                }
                disabledReason={
                  participants.length === 0
                    ? "Keine Teilnehmer im Kurs"
                    : !allSessionsCompleted
                      ? "Erst wenn alle Termine signiert sind"
                      : !course.anwCheckPassedAt
                        ? "ANW-Compliance-Check muss durchlaufen sein"
                        : !course.abgeschlossenAt
                          ? "Maßnahme muss als abgeschlossen markiert sein"
                          : "Alle Teilnehmer haben bereits freigegeben"
                }
                alreadySent={previewSent}
              />
            )}
          </Step>
          <Step
            index={5}
            title="Bildungsträger-Prüfung"
            done={course.reviewStatus === "approved"}
            subtitle={
              course.reviewStatus === "approved"
                ? `Vom Bildungsträger freigegeben${course.reviewDecidedAt ? ` am ${new Date(course.reviewDecidedAt).toLocaleString("de-DE")}` : ""}.`
                : course.reviewStatus === "pending"
                  ? `Beim Bildungsträger in Prüfung${course.reviewRequestedAt ? ` seit ${new Date(course.reviewRequestedAt).toLocaleString("de-DE")}` : ""}.`
                  : course.reviewStatus === "changes_requested"
                    ? "Nachbesserung angefordert — Hinweis unten beachten, Termine korrigieren und erneut einreichen."
                    : "Reiche die freigegebene Liste beim Bildungsträger zur Prüfung ein."
            }
          >
            {!impersonating &&
              course.reviewStatus !== "approved" &&
              course.reviewStatus !== "pending" && (
                <ReviewSubmitButton
                  courseId={course.id}
                  resubmit={course.reviewStatus === "changes_requested"}
                  disabled={
                    !allSessionsCompleted ||
                    !allApproved ||
                    !course.anwCheckPassedAt ||
                    !course.abgeschlossenAt
                  }
                  disabledReason={
                    !allSessionsCompleted
                      ? "Erst wenn alle Termine signiert sind"
                      : !course.anwCheckPassedAt
                        ? "ANW-Compliance-Check muss durchlaufen sein"
                        : !course.abgeschlossenAt
                          ? "Maßnahme muss als abgeschlossen markiert sein"
                          : !allApproved
                            ? "Der Kunde hat den Nachweis noch nicht freigegeben"
                            : undefined
                  }
                />
              )}
            {reviewNotes.length > 0 && <ReviewThread notes={reviewNotes} />}
          </Step>
          <Step
            index={6}
            title="Mit FES versiegeln"
            done={isSealed}
            subtitle={
              isSealed
                ? `Gesiegelt am ${finalDoc?.completedAt ? new Date(finalDoc.completedAt).toLocaleString("de-DE") : "—"}.`
                : "Letzter Schritt vor der Übergabe an den Bildungsträger."
            }
          >
            {!impersonating && !isSealed && (
              <SealCourseButton
                courseId={course.id}
                disabled={
                  !allSessionsCompleted ||
                  !allApproved ||
                  !course.anwCheckPassedAt ||
                  !course.abgeschlossenAt ||
                  course.reviewStatus !== "approved"
                }
                disabledReason={
                  !allSessionsCompleted
                    ? "Erst wenn alle Termine signiert sind"
                    : !allApproved
                      ? "Mindestens ein Teilnehmer hat noch nicht freigegeben"
                      : !course.anwCheckPassedAt
                        ? "ANW-Compliance-Check muss durchlaufen sein"
                        : !course.abgeschlossenAt
                          ? "Maßnahme muss als abgeschlossen markiert sein"
                          : course.reviewStatus !== "approved"
                            ? "Der Bildungsträger muss die Liste erst freigeben"
                            : undefined
                }
              />
            )}
            {isSealed && finalDoc?.pdfUrl && (
              <a
                href={finalDoc.pdfUrl}
                className="text-xs text-emerald-800 underline-offset-2 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Gesiegeltes PDF öffnen
              </a>
            )}
          </Step>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-300 px-6 py-4">
          <h2 className="text-lg font-semibold">
            Teilnehmer ({participants.length})
          </h2>
          {canManage && (
            <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-start">
              {/* 1:1: Kein nachträgliches Hinzufügen — der Kunde wird bei der
                  Anlage durch den Bildungsträger gesetzt. */}
              <NotifyParticipantsButton
                courseId={course.id}
                participantCount={participants.length}
              />
            </div>
          )}
        </div>
        <ul className="divide-y divide-zinc-200 text-sm">
          {participants.map((p) => {
            const approvedAt = approvalByParticipant.get(p.id);
            const ber = berByParticipant.get(p.id);
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3"
              >
                <div className="min-w-0 flex-1 basis-48">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-zinc-500">
                    Kd-Nr. {p.kundenNr} · {p.email}
                    {smsEnabled && p.phone && (
                      <span
                        title={`SMS-Versand möglich: ${p.phone}`}
                        className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-800"
                      >
                        SMS
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                    ANW
                  </span>
                  {approvedAt ? (
                    <span
                      title={`Freigegeben am ${new Date(approvedAt).toLocaleString("de-DE")}`}
                      className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
                    >
                      ✓
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      offen
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                    BER
                  </span>
                  {ber?.status === "submitted" ? (
                    <span
                      title={`Eingereicht am ${ber.submittedAt ? new Date(ber.submittedAt).toLocaleString("de-DE") : "—"}`}
                      className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
                    >
                      ✓ eingereicht
                    </span>
                  ) : ber ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      Entwurf
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      fehlt
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs">
                  {canManage && (
                    <Link
                      href={`/coach/courses/${course.id}/teilnehmer/${p.id}/bericht`}
                      className="text-zinc-700 underline-offset-2 hover:underline"
                      title="Abschlussbericht schreiben / bearbeiten"
                    >
                      {ber ? "BER bearbeiten" : "BER schreiben"}
                    </Link>
                  )}
                  <Link
                    href={`/coach/courses/${course.id}/print/${p.id}`}
                    className="text-zinc-700 underline-offset-2 hover:underline"
                    title="Stundennachweis-Druckvorschau"
                  >
                    Nachweis
                  </Link>
                  {canManage && (
                    <>
                      {smsEnabled && p.phone && (
                        <SmsResendButton
                          courseId={course.id}
                          participantId={p.id}
                          phone={p.phone}
                        />
                      )}
                      <QrHandoverButton
                        courseId={course.id}
                        participantId={p.id}
                        participantName={p.name}
                      />
                      <Link
                        href={`/coach/courses/${course.id}/teilnehmer/${p.id}/edit`}
                        className="text-zinc-700 underline-offset-2 hover:underline"
                        title="Stammdaten bearbeiten"
                      >
                        Bearbeiten
                      </Link>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Step({
  index,
  title,
  subtitle,
  done,
  children,
}: {
  index: number;
  title: string;
  subtitle: string;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 px-6 py-4">
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
          done
            ? "bg-emerald-600 text-white"
            : "bg-zinc-200 text-zinc-700"
        }`}
        aria-hidden
      >
        {done ? "✓" : index}
      </div>
      <div className="flex-1 space-y-2">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-zinc-500">{subtitle}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-300 bg-white px-5 py-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

const SESSION_STATUS_LABEL: Record<string, string> = {
  pending: "offen",
  coach_signed: "Link verschickt, wartet auf TN",
  completed: "abgeschlossen",
};

const SESSION_STATUS_BADGE: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-700",
  coach_signed: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
};

// ISO-Datum (YYYY-MM-DD) → DD.MM.YYYY. Keine Time-Zone-Konvertierung, weil
// `sessions.sessionDate` / `courses.startDate` pure Kalendertage sind — bei
// `new Date("2026-04-18")` würde der Browser UTC-Midnight interpretieren und
// je nach Zone einen Tag zurückspringen.
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

function SessionStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 ${SESSION_STATUS_BADGE[status] ?? ""}`}
    >
      {SESSION_STATUS_LABEL[status] ?? status}
    </span>
  );
}

import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireCoach } from "@/lib/dal";

export const dynamic = "force-dynamic";

type RowStatus = "submitted" | "draft" | "missing";

type Row = {
  courseId: string;
  courseTitle: string;
  participantId: string;
  participantName: string;
  kundenNr: string;
  status: RowStatus;
  submittedAt: Date | null;
  updatedAt: Date | null;
};

export default async function CheckerDashboard() {
  const session = await requireCoach();

  const rows = await db
    .select({
      courseId: schema.courses.id,
      courseTitle: schema.courses.title,
      participantId: schema.participants.id,
      participantName: schema.participants.name,
      kundenNr: schema.participants.kundenNr,
      berStatus: schema.abschlussberichte.status,
      berSubmittedAt: schema.abschlussberichte.submittedAt,
      berUpdatedAt: schema.abschlussberichte.updatedAt,
    })
    .from(schema.courses)
    .innerJoin(
      schema.courseParticipants,
      eq(schema.courseParticipants.courseId, schema.courses.id),
    )
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courseParticipants.participantId),
    )
    .leftJoin(
      schema.abschlussberichte,
      and(
        eq(schema.abschlussberichte.courseId, schema.courses.id),
        eq(
          schema.abschlussberichte.participantId,
          schema.courseParticipants.participantId,
        ),
      ),
    )
    .where(
      and(
        eq(schema.courses.coachId, session.user.id),
        isNull(schema.courses.deletedAt),
      ),
    )
    .orderBy(asc(schema.courses.title), asc(schema.participants.name));

  const normalized: Row[] = rows.map((r) => ({
    courseId: r.courseId,
    courseTitle: r.courseTitle,
    participantId: r.participantId,
    participantName: r.participantName,
    kundenNr: r.kundenNr,
    status: r.berStatus === "submitted"
      ? "submitted"
      : r.berStatus === "draft"
        ? "draft"
        : "missing",
    submittedAt: r.berSubmittedAt ? new Date(r.berSubmittedAt) : null,
    updatedAt: r.berUpdatedAt ? new Date(r.berUpdatedAt) : null,
  }));

  const missing = normalized.filter((r) => r.status === "missing");
  const drafts = normalized.filter((r) => r.status === "draft");
  const submitted = normalized.filter((r) => r.status === "submitted");

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Abschlussbericht-Checker
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Schreib TN-bezogene Abschlussberichte direkt in Signflow —
          anonymisiert, AMDL-konform geprüft, mit PDF-Export für den
          Bildungsträger.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="fehlen noch"
          count={missing.length}
          tone="neutral"
        />
        <StatCard
          label="Entwurf"
          count={drafts.length}
          tone="warning"
        />
        <StatCard
          label="eingereicht"
          count={submitted.length}
          tone="success"
        />
      </div>

      <BerListSection
        title="Noch offen"
        description="Teilnehmer, für die noch kein Bericht angelegt ist."
        rows={missing}
        emptyMessage="Alle Teilnehmer haben mindestens einen Entwurf."
      />

      <BerListSection
        title="In Arbeit (Entwurf)"
        description="Berichte mit Autosave-Stand, noch nicht eingereicht."
        rows={drafts}
        emptyMessage="Keine offenen Entwürfe."
      />

      <BerListSection
        title="Eingereicht"
        description="Bereits an den Bildungsträger übergeben — Edit weiterhin möglich."
        rows={submitted}
        emptyMessage="Noch keine eingereichten Berichte."
      />

      <section className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 text-sm">
        <h2 className="text-sm font-semibold text-zinc-900">
          Quick-Check ohne Speichern
        </h2>
        <p className="mt-1 text-xs text-zinc-600">
          Du willst einen Bericht-Entwurf aus Word nur kurz prüfen, ohne ihn
          im System abzulegen? Nutze den Ad-hoc-Check — keine Persistenz,
          nur Feedback im Browser.
        </p>
        <Link
          href="/coach/checker/check"
          className="mt-3 inline-block rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
        >
          Ad-hoc-Check öffnen →
        </Link>
      </section>
    </div>
  );
}

function StatCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "neutral" | "warning" | "success";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-300 bg-emerald-50"
      : tone === "warning"
        ? "border-amber-300 bg-amber-50"
        : "border-zinc-300 bg-white";
  const numClass =
    tone === "success"
      ? "text-emerald-800"
      : tone === "warning"
        ? "text-amber-800"
        : "text-zinc-900";

  return (
    <div className={`rounded-xl border ${toneClass} p-5`}>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-semibold ${numClass}`}>{count}</div>
    </div>
  );
}

function BerListSection({
  title,
  description,
  rows,
  emptyMessage,
}: {
  title: string;
  description: string;
  rows: Row[];
  emptyMessage: string;
}) {
  return (
    <section className="rounded-xl border border-zinc-300 bg-white">
      <div className="border-b border-zinc-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">
          {title} ({rows.length})
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-xs text-zinc-500">
          {emptyMessage}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {rows.map((r) => (
            <li
              key={`${r.courseId}-${r.participantId}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm"
            >
              <div className="min-w-0 flex-1 basis-60">
                <div className="font-medium text-zinc-900">
                  {r.participantName}
                </div>
                <div className="text-xs text-zinc-500">
                  Kurs: {r.courseTitle} · Kd-Nr. {r.kundenNr}
                </div>
              </div>
              <div className="text-xs text-zinc-500">
                {r.status === "submitted" && r.submittedAt
                  ? `eingereicht am ${r.submittedAt.toLocaleDateString("de-DE")}`
                  : r.status === "draft" && r.updatedAt
                    ? `zuletzt gespeichert ${r.updatedAt.toLocaleDateString("de-DE")}`
                    : "noch nicht begonnen"}
              </div>
              <Link
                href={`/coach/courses/${r.courseId}/teilnehmer/${r.participantId}/bericht`}
                className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
              >
                {r.status === "missing" ? "BER schreiben" : "bearbeiten"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireBildungstraeger } from "@/lib/dal";

import { SubmitAfaButton } from "./submit-button";

export const dynamic = "force-dynamic";

/**
 * Firma-/Bildungsträger-Ansicht über alle gesiegelten Stundennachweise. Nur
 * `role=bildungstraeger` hat Zugriff (requireBildungstraeger redirect). Coaches sehen diese
 * Seite nicht und können die AfA-Übermittlung nicht auslösen — siehe
 * CLAUDE.md → FES / AfA-Übermittlung (Firma-seitig, nicht Coach-seitig).
 *
 * Enthält ALLE Kurse mit `final_documents`-Zeile (also bereits gesiegelt
 * ODER noch in 'pending'). Unsubmitted = oben, damit der Arbeitsstapel
 * sichtbar ist.
 */
export default async function BildungstraegerSubmissionsPage() {
  await requireBildungstraeger();

  const rows = await db
    .select({
      courseId: schema.courses.id,
      courseTitle: schema.courses.title,
      avgsNummer: schema.courses.avgsNummer,
      coachName: schema.users.name,
      bedarfstraegerName: schema.bedarfstraeger.name,
      fesStatus: schema.finalDocuments.fesStatus,
      afaStatus: schema.finalDocuments.afaStatus,
      sealedAt: schema.finalDocuments.completedAt,
      submittedToAfaAt: schema.finalDocuments.submittedToAfaAt,
      pdfUrl: schema.finalDocuments.pdfUrl,
    })
    .from(schema.finalDocuments)
    .innerJoin(
      schema.courses,
      eq(schema.courses.id, schema.finalDocuments.courseId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .innerJoin(
      schema.bedarfstraeger,
      eq(schema.bedarfstraeger.id, schema.courses.bedarfstraegerId),
    )
    .orderBy(desc(schema.finalDocuments.completedAt));

  const pending = rows.filter(
    (r) => r.fesStatus === "completed" && r.afaStatus === "pending",
  );
  const submitted = rows.filter((r) => r.afaStatus === "submitted");
  const unsealed = rows.filter((r) => r.fesStatus !== "completed");

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-10">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            AfA-Übermittlungen
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Gesiegelte Stundennachweise aller Coaches. Nach der Übermittlung
            an die AfA wird der Kurs später mit dem Rechnungsflow gekoppelt.
          </p>
        </div>
        <Link
          href="/bildungstraeger"
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          ← zurück
        </Link>
      </header>

      <Section
        title={`Zu übermitteln (${pending.length})`}
        empty="Aktuell kein Kurs zur Übermittlung bereit."
      >
        {pending.map((r) => (
          <Row
            key={r.courseId}
            courseId={r.courseId}
            title={r.courseTitle}
            meta={[
              `AVGS ${r.avgsNummer}`,
              r.bedarfstraegerName,
              `Coach: ${r.coachName}`,
              r.sealedAt
                ? `Gesiegelt ${new Date(r.sealedAt).toLocaleDateString("de-DE")}`
                : null,
            ]}
            pdfUrl={r.pdfUrl}
            action={<SubmitAfaButton courseId={r.courseId} />}
          />
        ))}
      </Section>

      <Section
        title={`Übermittelt (${submitted.length})`}
        empty="Noch nichts übermittelt."
      >
        {submitted.map((r) => (
          <Row
            key={r.courseId}
            courseId={r.courseId}
            title={r.courseTitle}
            meta={[
              `AVGS ${r.avgsNummer}`,
              r.bedarfstraegerName,
              `Coach: ${r.coachName}`,
              r.submittedToAfaAt
                ? `Übermittelt ${new Date(r.submittedToAfaAt).toLocaleDateString("de-DE")}`
                : null,
            ]}
            pdfUrl={r.pdfUrl}
          />
        ))}
      </Section>

      {unsealed.length > 0 && (
        <Section title={`In Bearbeitung (${unsealed.length})`} empty="">
          {unsealed.map((r) => (
            <Row
              key={r.courseId}
              courseId={r.courseId}
              title={r.courseTitle}
              meta={[
                `AVGS ${r.avgsNummer}`,
                r.bedarfstraegerName,
                `Coach: ${r.coachName}`,
                "Noch nicht gesiegelt",
              ]}
              pdfUrl={null}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const hasChildren = items.some((c) => c != null && c !== false);

  return (
    <section className="rounded-xl border border-zinc-300 bg-white">
      <div className="border-b border-zinc-300 px-6 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {!hasChildren ? (
        <p className="px-6 py-8 text-center text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-zinc-200">{children}</ul>
      )}
    </section>
  );
}

function Row({
  title,
  meta,
  pdfUrl,
  action,
}: {
  courseId: string;
  title: string;
  meta: Array<string | null>;
  pdfUrl: string | null;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="font-medium">{title}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
          {meta.filter((m): m is string => !!m).map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-700 underline-offset-2 hover:underline"
          >
            PDF öffnen
          </a>
        )}
        {action}
      </div>
    </li>
  );
}

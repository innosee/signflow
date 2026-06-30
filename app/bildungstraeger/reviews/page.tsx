import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";

import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";
import { formatDateDE } from "@/lib/format-date";

export const dynamic = "force-dynamic";

/**
 * Bildungsträger-Inbox „Anwesenheitslisten zur Prüfung". Zeigt offene
 * Prüfungen (`review_status = 'pending'`) oben als Arbeitsstapel, darunter
 * die zuletzt entschiedenen zur Nachverfolgung. Tenant-Filter über den
 * Coach-Join — ein BT sieht nur Kurse des eigenen Mandanten.
 */
export default async function BildungstraegerReviewsPage() {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);

  const rows = await db
    .select({
      courseId: schema.courses.id,
      courseTitle: schema.courses.title,
      avgsNummer: schema.courses.avgsNummer,
      reviewStatus: schema.courses.reviewStatus,
      requestedAt: schema.courses.reviewRequestedAt,
      decidedAt: schema.courses.reviewDecidedAt,
      coachName: schema.users.name,
      customerName: schema.participants.name,
    })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(
      and(
        eq(schema.users.tenantId, tenantId),
        ne(schema.courses.reviewStatus, "none"),
      ),
    )
    .orderBy(desc(schema.courses.reviewRequestedAt));

  const pending = rows.filter((r) => r.reviewStatus === "pending");
  const decided = rows.filter((r) => r.reviewStatus !== "pending");

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-10">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Anwesenheitslisten prüfen
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Coaches reichen abgeschlossene, vom Kunden freigegebene
            Anwesenheitslisten zur Prüfung ein. Erst nach deiner Freigabe kann
            der Coach den Nachweis abschließen.
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
        title={`Zu prüfen (${pending.length})`}
        empty="Aktuell keine Liste zur Prüfung."
      >
        {pending.map((r) => (
          <Row
            key={r.courseId}
            courseId={r.courseId}
            title={r.courseTitle}
            badge="zu prüfen"
            badgeClass="bg-amber-100 text-amber-800"
            meta={[
              `Kunde: ${r.customerName}`,
              `AVGS ${r.avgsNummer}`,
              `Coach: ${r.coachName}`,
              r.requestedAt
                ? `Eingereicht ${formatDateDE(r.requestedAt)}`
                : null,
            ]}
          />
        ))}
      </Section>

      {decided.length > 0 && (
        <Section title={`Entschieden (${decided.length})`} empty="">
          {decided.map((r) => (
            <Row
              key={r.courseId}
              courseId={r.courseId}
              title={r.courseTitle}
              badge={
                r.reviewStatus === "approved"
                  ? "freigegeben"
                  : "Nachbesserung"
              }
              badgeClass={
                r.reviewStatus === "approved"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-zinc-100 text-zinc-700"
              }
              meta={[
                `Kunde: ${r.customerName}`,
                `Coach: ${r.coachName}`,
                r.decidedAt
                  ? `Entschieden ${formatDateDE(r.decidedAt)}`
                  : null,
              ]}
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
  courseId,
  title,
  meta,
  badge,
  badgeClass,
}: {
  courseId: string;
  title: string;
  meta: Array<string | null>;
  badge: string;
  badgeClass: string;
}) {
  return (
    <li className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{title}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClass}`}
          >
            {badge}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
          {meta
            .filter((m): m is string => !!m)
            .map((m) => (
              <span key={m}>{m}</span>
            ))}
        </div>
      </div>
      <Link
        href={`/bildungstraeger/reviews/${courseId}`}
        className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50"
      >
        Öffnen
      </Link>
    </li>
  );
}

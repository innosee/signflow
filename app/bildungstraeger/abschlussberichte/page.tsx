import Link from "next/link";
import { and, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireBildungstraeger } from "@/lib/dal";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function BildungstraegerAbschlussberichteListPage({
  searchParams,
}: Props) {
  await requireBildungstraeger();
  const { q: rawQuery } = await searchParams;
  const q = (rawQuery ?? "").trim();

  // Liste aller eingereichten Berichte — Kurs-gebunden + Ad-hoc.
  // leftJoin, weil Ad-hoc-BERs keine Course/Participant-FKs haben; TN-Daten
  // kommen dann aus den Snapshot-Spalten.
  const rows = await db
    .select({
      id: schema.abschlussberichte.id,
      submittedAt: schema.abschlussberichte.submittedAt,
      tnVorname: schema.abschlussberichte.tnVorname,
      tnNachname: schema.abschlussberichte.tnNachname,
      tnKundenNr: schema.abschlussberichte.tnKundenNr,
      coachId: schema.abschlussberichte.coachId,
      coachName: sql<string>`COALESCE(${schema.users.name}, ${schema.abschlussberichte.coachNameSnapshot})`,
      courseId: schema.abschlussberichte.courseId,
      courseTitle: schema.courses.title,
      // Fallback für Kurs-gebundene BERs, deren tn_* Snapshot noch nicht
      // gefüllt ist (z.B. wenn die Migration ohne Backfill lief — defensive,
      // damit die Liste nichts „leer" anzeigt).
      participantName: schema.participants.name,
      participantKundenNr: schema.participants.kundenNr,
    })
    .from(schema.abschlussberichte)
    .leftJoin(
      schema.users,
      eq(schema.users.id, schema.abschlussberichte.coachId),
    )
    .leftJoin(
      schema.courses,
      eq(schema.courses.id, schema.abschlussberichte.courseId),
    )
    .leftJoin(
      schema.participants,
      eq(schema.participants.id, schema.abschlussberichte.participantId),
    )
    .where(
      and(
        eq(schema.abschlussberichte.status, "submitted"),
        isNotNull(schema.abschlussberichte.submittedAt),
        q.length > 0
          ? or(
              ilike(schema.abschlussberichte.tnNachname, `%${q}%`),
              ilike(schema.abschlussberichte.tnVorname, `%${q}%`),
              ilike(schema.abschlussberichte.tnKundenNr, `%${q}%`),
              ilike(schema.participants.name, `%${q}%`),
              ilike(schema.participants.kundenNr, `%${q}%`),
              ilike(schema.users.name, `%${q}%`),
              ilike(schema.courses.title, `%${q}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(schema.abschlussberichte.submittedAt));

  const items = rows.map((r) => {
    const tnDisplay =
      r.tnVorname || r.tnNachname
        ? `${r.tnVorname} ${r.tnNachname}`.trim()
        : (r.participantName ?? "—");
    const kdDisplay = r.tnKundenNr || r.participantKundenNr || "";
    return {
      id: r.id,
      tnDisplay,
      kdDisplay,
      coachName: r.coachName,
      courseTitle: r.courseTitle,
      submittedAt: r.submittedAt ? new Date(r.submittedAt) : null,
      isAdhoc: r.courseId === null,
    };
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 space-y-6">
      <header>
        <Link
          href="/bildungstraeger"
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← zurück zur Übersicht
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Eingereichte Abschlussberichte
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Alle von Coaches an dich übergebenen Berichte — Kurs-gebunden und
          Ad-hoc-Schnell-Check zusammen. Nutze die Suche nach Name, Kunden-Nr.
          oder Kurs.
        </p>
      </header>

      <form
        action="/bildungstraeger/abschlussberichte"
        method="get"
        className="rounded-xl border border-zinc-300 bg-white p-3"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Suche nach TN-Name, Kunden-Nr., Coach oder Kurs …"
          className="block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
      </form>

      <section className="rounded-xl border border-zinc-300 bg-white">
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <h2 className="text-sm font-semibold">
            {items.length} {items.length === 1 ? "Bericht" : "Berichte"}
            {q && ` für „${q}"`}
          </h2>
        </header>
        {items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            {q
              ? "Keine Berichte zu deiner Suche."
              : "Noch keine eingereichten Berichte."}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm"
              >
                <div className="min-w-0 flex-1 basis-60">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900">
                      {it.tnDisplay}
                    </span>
                    {it.isAdhoc && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                        Schnell-Check
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {it.kdDisplay && <span>Kd-Nr. {it.kdDisplay} · </span>}
                    Coach: {it.coachName}
                    {it.courseTitle && <> · Kurs: {it.courseTitle}</>}
                  </div>
                </div>
                <div className="text-xs text-zinc-500">
                  {it.submittedAt
                    ? `eingereicht ${it.submittedAt.toLocaleDateString("de-DE")}`
                    : ""}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/bildungstraeger/abschlussberichte/${it.id}`}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                  >
                    Ansehen
                  </Link>
                  <a
                    href={`/api/bildungstraeger/abschlussberichte/${it.id}/pdf`}
                    className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                  >
                    PDF
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

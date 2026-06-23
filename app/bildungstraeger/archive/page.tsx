import Link from "next/link";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";

import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";

import { unarchiveCourse } from "../courses/actions";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function BildungstraegerArchivePage({
  searchParams,
}: Props) {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);
  const { q: rawQuery } = await searchParams;
  const q = (rawQuery ?? "").trim();

  const customers = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      participantName: schema.participants.name,
      kundenNr: schema.participants.kundenNr,
      coachName: schema.users.name,
      bedarfstraegerName: schema.bedarfstraeger.name,
    })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .innerJoin(
      schema.bedarfstraeger,
      eq(schema.bedarfstraeger.id, schema.courses.bedarfstraegerId),
    )
    .where(
      and(
        eq(schema.users.tenantId, tenantId),
        isNull(schema.courses.deletedAt),
        eq(schema.courses.status, "archived"),
        q.length > 0
          ? or(
              ilike(schema.participants.name, `%${q}%`),
              ilike(schema.participants.kundenNr, `%${q}%`),
              ilike(schema.users.name, `%${q}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(schema.courses.createdAt));

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 space-y-6">
      <header>
        <Link
          href="/bildungstraeger/courses"
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← zurück zu den Kunden
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Archiv</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Archivierte Maßnahmen-Kunden. Nutze die Suche nach Teilnehmer-Name,
          Kunden-Nr. oder Coach. Über „Wiederherstellen“ landet ein Kunde wieder
          in der aktiven Liste.
        </p>
      </header>

      <form
        action="/bildungstraeger/archive"
        method="get"
        className="rounded-xl border border-zinc-300 bg-white p-3"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Suche nach TN-Name, Kunden-Nr. oder Coach …"
          className="block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
      </form>

      <section className="rounded-xl border border-zinc-300 bg-white">
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <h2 className="text-sm font-semibold">
            {customers.length} {customers.length === 1 ? "Kunde" : "Kunden"}
            {q && ` für „${q}"`}
          </h2>
        </header>
        {customers.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            {q
              ? "Keine archivierten Kunden zu deiner Suche."
              : "Noch keine archivierten Kunden."}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {customers.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-4 px-5 py-4 text-sm"
              >
                <Link
                  href={`/bildungstraeger/courses/${c.id}/berichte`}
                  className="min-w-0 flex-1 hover:underline"
                >
                  <div className="font-medium">
                    {c.participantName} <span className="text-zinc-400">·</span>{" "}
                    <span className="font-normal text-zinc-600">{c.title}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    Kd-Nr. {c.kundenNr} · Coach: {c.coachName} ·{" "}
                    {c.bedarfstraegerName}
                  </div>
                </Link>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                    Archiviert
                  </span>
                  <Link
                    href={`/bildungstraeger/courses/${c.id}/berichte`}
                    className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    Ansehen
                  </Link>
                  <form action={unarchiveCourse}>
                    <input type="hidden" name="courseId" value={c.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                    >
                      Wiederherstellen
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

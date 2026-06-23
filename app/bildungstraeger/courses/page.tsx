import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";

import {
  archiveAllCompleted,
  archiveCourse,
  unarchiveCourse,
} from "./actions";
import { DeleteCourseButton } from "./delete-course-button";

export const dynamic = "force-dynamic";

export default async function BildungstraegerCoursesPage() {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);

  const customers = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      status: schema.courses.status,
      abgeschlossenAt: schema.courses.abgeschlossenAt,
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
      and(eq(schema.users.tenantId, tenantId), isNull(schema.courses.deletedAt)),
    )
    .orderBy(desc(schema.courses.createdAt));

  // „Abgeschlossen" = Maßnahme als abgeschlossen markiert (abgeschlossen_at).
  const archivableCount = customers.filter(
    (c) => c.abgeschlossenAt && c.status !== "archived",
  ).length;

  const statusLabel = (c: (typeof customers)[number]) =>
    c.status === "archived"
      ? "Archiviert"
      : c.abgeschlossenAt
        ? "Abgeschlossen"
        : "Aktiv";

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            Kunden ({customers.length})
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Maßnahmen-Kunden des Bildungsträgers. Lege einen Kunden an und weise
            ihn einem Coach zu — der Coach erfasst dann die Termine.
          </p>
        </header>
        <div className="flex shrink-0 items-center gap-2">
          {archivableCount > 0 && (
            <form action={archiveAllCompleted}>
              <button
                type="submit"
                className="rounded-lg border border-zinc-400 px-3 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Alle abgeschlossenen archivieren ({archivableCount})
              </button>
            </form>
          )}
          <Link
            href="/bildungstraeger/courses/new"
            className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            + Neuer Kunde
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-zinc-300 bg-white">
        {customers.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            Noch keine Kunden. Lege den ersten an, um loszulegen.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {customers.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-4 px-6 py-4 text-sm"
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
                    {statusLabel(c)}
                  </span>
                  <Link
                    href={`/bildungstraeger/courses/${c.id}/edit`}
                    className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    Bearbeiten
                  </Link>
                  {c.status === "archived" ? (
                    <form action={unarchiveCourse}>
                      <input type="hidden" name="courseId" value={c.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                      >
                        Wiederherstellen
                      </button>
                    </form>
                  ) : (
                    <form action={archiveCourse}>
                      <input type="hidden" name="courseId" value={c.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                      >
                        Archivieren
                      </button>
                    </form>
                  )}
                  <DeleteCourseButton
                    courseId={c.id}
                    participantName={c.participantName}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

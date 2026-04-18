import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { isImpersonating, requireCoach } from "@/lib/dal";

import { logoutAction } from "../login/actions";
import { stopImpersonating } from "../agency/actions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  active: "aktiv",
  completed: "abgeschlossen",
  archived: "archiviert",
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  completed: "bg-zinc-200 text-zinc-700",
  archived: "bg-zinc-100 text-zinc-500",
};

export default async function CoachDashboard() {
  const session = await requireCoach();
  const impersonating = isImpersonating(session);

  const courses = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      avgsNummer: schema.courses.avgsNummer,
      startDate: schema.courses.startDate,
      endDate: schema.courses.endDate,
      status: schema.courses.status,
      anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
    })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.coachId, session.user.id),
        isNull(schema.courses.deletedAt),
      ),
    )
    .orderBy(desc(schema.courses.createdAt));

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-8">
      {impersonating && (
        <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <div>
            <strong>Impersonation aktiv.</strong> Du siehst die Oberfläche als{" "}
            {session.user.name}. Schreibende Aktionen sind blockiert.
          </div>
          <form action={stopImpersonating}>
            <button
              type="submit"
              className="rounded-lg border border-amber-400 px-3 py-1 text-sm hover:bg-amber-100"
            >
              Impersonation beenden
            </button>
          </form>
        </div>
      )}

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Coach Dashboard
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {session.user.name} ({session.user.email})
          </p>
        </div>
        {!impersonating && (
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              Abmelden
            </button>
          </form>
        )}
      </header>

      <section className="rounded-xl border border-zinc-300 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-300 px-6 py-4">
          <h2 className="text-lg font-semibold">
            Meine Kurse ({courses.length})
          </h2>
          {!impersonating && (
            <Link
              href="/coach/courses/new"
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              + Neuer Kurs
            </Link>
          )}
        </div>

        {courses.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            Noch keine Kurse. Lege deinen ersten Kurs an, um loszulegen.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {courses.map((c) => (
              <li key={c.id} className="px-6 py-4">
                <Link
                  href={`/coach/courses/${c.id}`}
                  className="flex items-start justify-between gap-4 hover:opacity-80"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{c.title}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[c.status] ?? ""}`}
                      >
                        {STATUS_LABELS[c.status] ?? c.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      AVGS {c.avgsNummer} · {c.startDate} bis {c.endDate} ·{" "}
                      {c.anzahlBewilligteUe} UE bewilligt
                    </div>
                  </div>
                  <span aria-hidden className="text-zinc-400">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

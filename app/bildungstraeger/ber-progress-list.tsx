"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const COURSE_STATUS_LABEL: Record<string, string> = {
  active: "aktiv",
  completed: "abgeschlossen",
  archived: "archiviert",
};

export type BerProgressRow = {
  courseId: string;
  courseTitle: string;
  coachName: string;
  courseStatus: string;
  tnCount: number;
  submittedCount: number;
  draftCount: number;
};

export function BerProgressList({ rows }: { rows: BerProgressRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const haystack = [
        r.courseTitle,
        r.coachName,
        COURSE_STATUS_LABEL[r.courseStatus] ?? r.courseStatus,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query]);

  if (rows.length === 0) {
    return (
      <p className="px-6 py-8 text-center text-sm text-zinc-500">
        Noch keine Kurse im System.
      </p>
    );
  }

  return (
    <>
      <div className="border-b border-zinc-200 px-6 py-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suche nach Kurs, Coach oder Status…"
          className="block w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-zinc-500">
          Keine Treffer für „{query}“.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200">
          {filtered.map((row) => {
            const missing = row.tnCount - row.submittedCount - row.draftCount;
            const percent =
              row.tnCount > 0
                ? Math.round((row.submittedCount / row.tnCount) * 100)
                : 0;
            return (
              <li
                key={row.courseId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 text-sm"
              >
                <div className="min-w-0 flex-1 basis-48">
                  <div className="font-medium">{row.courseTitle}</div>
                  <div className="text-xs text-zinc-500">
                    Coach: {row.coachName} · Kurs-Status:{" "}
                    {COURSE_STATUS_LABEL[row.courseStatus] ?? row.courseStatus}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800"
                    title="eingereicht"
                  >
                    ✓ {row.submittedCount}
                  </span>
                  <span
                    className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800"
                    title="Entwurf"
                  >
                    ✎ {row.draftCount}
                  </span>
                  <span
                    className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600"
                    title="noch nicht begonnen"
                  >
                    … {missing}
                  </span>
                  <span className="ml-1 text-xs text-zinc-500">
                    ({percent}% eingereicht)
                  </span>
                </div>
                <Link
                  href={`/bildungstraeger/courses/${row.courseId}/berichte`}
                  className="text-xs text-zinc-700 underline-offset-2 hover:underline"
                >
                  Berichte ansehen →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

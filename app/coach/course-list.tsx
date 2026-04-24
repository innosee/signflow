"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

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

export type CoachCourseListItem = {
  id: string;
  title: string;
  avgsNummer: string | null;
  startDate: string;
  endDate: string;
  status: string;
  anzahlBewilligteUe: number | null;
};

export function CoachCourseList({ courses }: { courses: CoachCourseListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => {
      const haystack = [
        c.title,
        c.avgsNummer ?? "",
        STATUS_LABELS[c.status] ?? c.status,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [courses, query]);

  if (courses.length === 0) {
    return (
      <p className="px-6 py-10 text-center text-sm text-zinc-500">
        Noch keine Kurse. Lege deinen ersten Kurs an, um loszulegen.
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
          placeholder="Suche nach Titel, AVGS-Nr. oder Status…"
          className="block w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-zinc-500">
          Keine Treffer für „{query}“.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200">
          {filtered.map((c) => (
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
    </>
  );
}

"use client";

import { useMemo, useState } from "react";

import { CoachListItem, type CoachRow } from "./coach-list-item";

/**
 * Coaches-Liste mit Freitextsuche (Name, E-Mail, Status). Client-seitig —
 * die Zeilen kommen fertig vom Dashboard, gefiltert wird im Browser (analog
 * zum Kunden-Cockpit). Bei vielen Coaches (Bestandskunden ~90+) sonst
 * unübersichtlich.
 */
export function CoachSearchList({
  coaches,
  canImpersonate,
}: {
  coaches: CoachRow[];
  canImpersonate: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return coaches;
    return coaches.filter((c) =>
      [
        c.name,
        c.email,
        c.emailVerified ? "aktiv" : "einladung ausstehend",
        c.banned ? "deaktiviert" : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [coaches, query]);

  return (
    <section className="rounded-xl border border-zinc-300 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-300 px-6 py-4">
        <h2 className="text-lg font-semibold">Coaches ({coaches.length})</h2>
        {coaches.length > 0 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Coach suchen (Name, E-Mail, Status) …"
            aria-label="Coaches durchsuchen"
            className="w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black sm:w-80"
          />
        )}
      </div>
      {coaches.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-zinc-500">
          Noch keine Coaches. Lade den ersten oben ein.
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-zinc-500">
          Keine Treffer für „{query}“.
        </p>
      ) : (
        <ul className="divide-y divide-black/5">
          {filtered.map((c) => (
            <CoachListItem
              key={c.id}
              coach={c}
              canImpersonate={canImpersonate}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

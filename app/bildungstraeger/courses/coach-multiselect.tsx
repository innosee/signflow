"use client";

import { useMemo, useState } from "react";

export type CoachOption = { id: string; name: string; email: string };

/**
 * Searchable Multiselect für das Kompetenzteam eines Kunden. Der Bildungsträger
 * wählt 1–n Coaches; bei großen Trägern (90+ Coaches) filtert die Suche nach
 * Name/E-Mail. Ausgewählte IDs werden als mehrere Hidden-Inputs `coachIds` ans
 * Formular gehängt (Server liest `formData.getAll("coachIds")`).
 */
export function CoachMultiSelect({
  coaches,
  value,
  onChange,
}: {
  coaches: CoachOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const selected = useMemo(
    () => coaches.filter((c) => value.includes(c.id)),
    [coaches, value],
  );
  const filtered = useMemo(() => {
    if (!q) return coaches;
    return coaches.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [coaches, q]);

  const toggle = (id: string) =>
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );

  return (
    <div className="space-y-2">
      {/* Submit-Werte */}
      {value.map((id) => (
        <input key={id} type="hidden" name="coachIds" value={id} />
      ))}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2.5 py-1 text-xs text-white"
            >
              {c.name}
              <button
                type="button"
                onClick={() => toggle(c.id)}
                aria-label={`${c.name} entfernen`}
                className="text-zinc-300 transition hover:text-white"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Coach suchen (Name oder E-Mail)…"
        className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
      />

      <div className="max-h-56 divide-y divide-zinc-200 overflow-auto rounded-lg border border-zinc-300">
        {coaches.length === 0 ? (
          <p className="px-3 py-3 text-sm text-zinc-500">
            Noch keine Coaches vorhanden — zuerst im Team-Bereich Coaches
            einladen.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-3 text-sm text-zinc-500">Kein Coach gefunden.</p>
        ) : (
          filtered.map((c) => {
            const isSel = value.includes(c.id);
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => toggle(c.id)}
                aria-pressed={isSel}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-zinc-50 ${
                  isSel ? "bg-zinc-50" : ""
                }`}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{c.name}</span>{" "}
                  <span className="text-zinc-500">{c.email}</span>
                </span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                    isSel
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-400 text-transparent"
                  }`}
                  aria-hidden="true"
                >
                  ✓
                </span>
              </button>
            );
          })
        )}
      </div>

      <p className="text-xs text-zinc-500">
        {value.length} Coach
        {value.length === 1 ? "" : "es"} ausgewählt. Nur diese können Termine für
        den Kunden anlegen und signieren.
      </p>
    </div>
  );
}

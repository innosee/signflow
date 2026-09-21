"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type CoachOption = {
  id: string;
  name: string;
  email: string;
  /**
   * Deaktivierter (soft-deleted) Coach, der noch im Kompetenzteam des Kunden
   * hängt. Wird als Chip angezeigt, damit der BT ihn entfernen kann — aber
   * nicht mehr im Dropdown zur Neu-Auswahl angeboten.
   */
  inactive?: boolean;
};

/**
 * Maximal gerenderte Treffer im Dropdown. Hält das DOM klein, egal wie viele
 * Coaches der Träger hat (80, 500, …) — wer mehr sieht, grenzt per Suche ein.
 */
const MAX_RESULTS = 50;

/**
 * Searchable Multiselect für das Kompetenzteam eines Kunden. Der Bildungsträger
 * wählt 1–n Coaches; bei großen Trägern (80+ Coaches) filtert die Suche nach
 * Name/E-Mail. Das Dropdown ist standardmäßig zu und öffnet erst bei Fokus —
 * so sieht man nie eine Wand aus allen Coaches, sondern grenzt gezielt ein.
 *
 * Ausgewählte IDs werden als mehrere Hidden-Inputs `coachIds` ans Formular
 * gehängt (Server liest `formData.getAll("coachIds")`).
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();

  // Klick außerhalb schließt das Dropdown.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const selected = useMemo(
    () => coaches.filter((c) => value.includes(c.id)),
    [coaches, value],
  );
  // Nur aktive Coaches sind neu auswählbar. Deaktivierte erscheinen
  // ausschließlich als Chip (siehe `selected`), damit man sie sehen und
  // entfernen, aber nicht neu zuweisen kann.
  const selectable = useMemo(() => coaches.filter((c) => !c.inactive), [coaches]);
  const filtered = useMemo(() => {
    if (!q) return selectable;
    return selectable.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [selectable, q]);
  const visible = filtered.slice(0, MAX_RESULTS);
  const overflow = filtered.length - visible.length;

  const toggle = (id: string) =>
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );

  return (
    <div ref={containerRef} className="relative space-y-2">
      {/* Submit-Werte */}
      {value.map((id) => (
        <input key={id} type="hidden" name="coachIds" value={id} />
      ))}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <span
              key={c.id}
              title={
                c.inactive
                  ? "Dieser Coach ist deaktiviert und hängt noch am Kunden — zum Entfernen auf × klicken."
                  : undefined
              }
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                c.inactive
                  ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
                  : "bg-zinc-900 text-white"
              }`}
            >
              {c.name}
              {c.inactive && " (deaktiviert)"}
              <button
                type="button"
                onClick={() => toggle(c.id)}
                aria-label={`${c.name} entfernen`}
                className={
                  c.inactive
                    ? "text-amber-700 transition hover:text-amber-900"
                    : "text-zinc-300 transition hover:text-white"
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {selected.some((c) => c.inactive) && (
        <p className="text-xs text-amber-800">
          Ein deaktivierter Coach hängt noch an diesem Kunden. Du kannst ihn
          über das × entfernen oder stehen lassen — speichern lässt sich beides.
        </p>
      )}

      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Coach suchen (Name oder E-Mail)…"
        role="combobox"
        aria-expanded={open}
        aria-controls="coach-multiselect-list"
        className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
      />

      {open && (
        <div
          id="coach-multiselect-list"
          className="absolute z-10 mt-1 w-full max-h-56 divide-y divide-zinc-200 overflow-auto rounded-lg border border-zinc-300 bg-white shadow-lg"
        >
          {selectable.length === 0 ? (
            <p className="px-3 py-3 text-sm text-zinc-500">
              Noch keine Coaches vorhanden — zuerst im Team-Bereich Coaches
              einladen.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-zinc-500">Kein Coach gefunden.</p>
          ) : (
            <>
              {visible.map((c) => {
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
              })}
              {overflow > 0 && (
                <p className="px-3 py-2 text-xs text-zinc-500">
                  … {overflow} weitere{overflow === 1 ? "r" : ""} — bitte
                  Suche weiter eingrenzen.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <p className="text-xs text-zinc-500">
        {value.length} Coach
        {value.length === 1 ? "" : "es"} ausgewählt. Nur diese können Termine für
        den Kunden anlegen und signieren.
      </p>
    </div>
  );
}

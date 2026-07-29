"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type BedarfstraegerOption = {
  id: string;
  name: string;
  type: "JC" | "AA";
};

/**
 * Maximal gerenderte Treffer im Dropdown — hält das DOM klein, egal wie viele
 * Bedarfsträger der Träger hat. Wer mehr sieht, grenzt per Suche ein.
 */
const MAX_RESULTS = 50;

/**
 * Searchable Single-Select für den Bedarfsträger beim Kunde-Anlegen/-Bearbeiten.
 * Bei vielen Bedarfsträgern (Jobcenter/Agenturen) filtert die Suche nach Name;
 * das Dropdown öffnet erst bei Fokus. Der gewählte Wert hängt als Hidden-Input
 * `bedarfstraegerId` am Formular (Server-Validierung greift zusätzlich). Analog
 * zum CoachMultiSelect, nur Einfachauswahl.
 */
export function BedarfstraegerSelect({
  options,
  value,
  onChange,
}: {
  options: BedarfstraegerOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();

  // Klick außerhalb schließt das Dropdown und verwirft die transiente Suche
  // (die Auswahl selbst bleibt erhalten).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );
  const filtered = useMemo(() => {
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) || o.type.toLowerCase().includes(q),
    );
  }, [options, q]);
  const visible = filtered.slice(0, MAX_RESULTS);
  const overflow = filtered.length - visible.length;

  const pick = (id: string) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Submit-Wert */}
      <input type="hidden" name="bedarfstraegerId" value={value} />

      <input
        type="search"
        // Geschlossen: zeigt die aktuelle Auswahl. Offen: zeigt die Suche.
        value={open ? query : selected ? `${selected.name} (${selected.type})` : ""}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        placeholder={
          selected
            ? "Bedarfsträger ändern (tippen zum Suchen)…"
            : "Bedarfsträger wählen (Name eingeben)…"
        }
        role="combobox"
        aria-expanded={open}
        aria-controls="bedarfstraeger-list"
        className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
      />

      {open && (
        <div
          id="bedarfstraeger-list"
          className="absolute z-10 mt-1 w-full max-h-56 divide-y divide-zinc-200 overflow-auto rounded-lg border border-zinc-300 bg-white shadow-lg"
        >
          {options.length === 0 ? (
            <p className="px-3 py-3 text-sm text-zinc-500">
              Noch keine Bedarfsträger angelegt.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-zinc-500">
              Kein Bedarfsträger gefunden.
            </p>
          ) : (
            <>
              {visible.map((o) => {
                const isSel = o.id === value;
                return (
                  <button
                    type="button"
                    key={o.id}
                    onClick={() => pick(o.id)}
                    aria-pressed={isSel}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-zinc-50 ${
                      isSel ? "bg-zinc-50" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{o.name}</span>{" "}
                      <span className="text-zinc-500">({o.type})</span>
                    </span>
                    {isSel && (
                      <span
                        className="shrink-0 text-zinc-900"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
              {overflow > 0 && (
                <p className="px-3 py-2 text-xs text-zinc-500">
                  … {overflow} weitere — bitte Suche eingrenzen.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

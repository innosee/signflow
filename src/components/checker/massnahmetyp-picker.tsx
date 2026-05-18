"use client";

import {
  MASSNAHME_TYPEN,
  type MassnahmeTyp,
} from "@/lib/checker/types";

/**
 * Maßnahmetyp-Dropdown. Steuert serverseitig die Pflichtbaustein-Liste
 * (siehe `MUST_HAVES_BY_MASSNAHMETYP`) und den Prompt-Kontext, der an
 * Azure geschickt wird.
 *
 * Wird sowohl im Coach-Editor als auch im BT-Review-Form genutzt — daher
 * eigene Komponente statt zweimal inline.
 */
export function MassnahmetypPicker({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: MassnahmeTyp;
  onChange: (next: MassnahmeTyp) => void;
  className?: string;
}) {
  const current = MASSNAHME_TYPEN.find((m) => m.id === value) ?? MASSNAHME_TYPEN[0];
  return (
    <div className={className ?? "space-y-1.5"}>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-zinc-900"
      >
        Maßnahmetyp
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as MassnahmeTyp)}
        className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
      >
        {MASSNAHME_TYPEN.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-zinc-500">{current.hint}</p>
    </div>
  );
}

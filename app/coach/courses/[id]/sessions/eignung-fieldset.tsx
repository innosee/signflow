"use client";

import {
  EIGNUNG_KRITERIEN,
  EIGNUNG_RATINGS,
  eignungFieldName,
  type Eignungsanalyse,
} from "@/lib/eignung";

/**
 * Eignungsanalyse-Abfrage beim Erstgespräch: 4 Kriterien je ++/O/--, plus das
 * Gesamtergebnis „TN ist geeignet (Ja/Nein)". Geteilt von Anlage- und
 * Bearbeiten-Formular. `defaultEignung`/`defaultGeeignet` befüllen die Felder
 * im Edit-Fall (Alt-Erstgespräche ohne Analyse → nur Ergebnis vorbelegt).
 */
export function EignungAnalyseFieldset({
  defaultGeeignet,
  defaultEignung,
}: {
  defaultGeeignet?: boolean | null;
  defaultEignung?: Eignungsanalyse | null;
}) {
  return (
    <fieldset className="rounded-lg border border-zinc-300 bg-zinc-50 p-4 space-y-3">
      <legend className="px-1 text-sm font-medium text-zinc-800">
        Eignungsanalyse <span className="text-red-600">*</span>
      </legend>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-zinc-500">
            <th className="text-left font-medium">Kriterium</th>
            {EIGNUNG_RATINGS.map((r) => (
              <th key={r.value} className="w-12 text-center font-medium">
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {EIGNUNG_KRITERIEN.map((k) => (
            <tr key={k.key} className="border-t border-zinc-200">
              <td className="py-1.5 text-zinc-800">{k.label}</td>
              {EIGNUNG_RATINGS.map((r) => (
                <td key={r.value} className="text-center">
                  <input
                    type="radio"
                    name={eignungFieldName(k.key)}
                    value={r.value}
                    required
                    defaultChecked={defaultEignung?.[k.key] === r.value}
                    aria-label={`${k.label}: ${r.label}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-4 border-t border-zinc-300 pt-3 text-sm">
        <span className="font-medium text-zinc-800">
          Ergebnis — TN ist geeignet? <span className="text-red-600">*</span>
        </span>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="geeignet"
            value="ja"
            required
            defaultChecked={defaultGeeignet === true}
          />
          Ja
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="geeignet"
            value="nein"
            required
            defaultChecked={defaultGeeignet === false}
          />
          Nein
        </label>
      </div>
    </fieldset>
  );
}

"use client";

import { useState } from "react";

import { splitReport } from "@/lib/checker/split-text";
import type { CheckerInput } from "@/lib/checker/types";

export function PasteTextButton({
  onExtracted,
}: {
  onExtracted: (input: CheckerInput) => void;
}) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleSubmit() {
    const result = splitReport(text);
    const sectionsFound = [
      result.teilnahme,
      result.ablauf,
      result.fazit,
    ].filter((s) => s.trim().length > 0).length;

    if (sectionsFound === 0) {
      setFeedback(
        "Konnte keine Abschnitts-Überschriften erkennen — der Text wurde ins erste Feld übernommen. Du kannst manuell auf die drei Felder aufteilen.",
      );
    } else if (sectionsFound < 3) {
      setFeedback(
        `${sectionsFound} von 3 Abschnitten erkannt. Schau nach und korrigiere ggf. manuell.`,
      );
    } else {
      setFeedback("Alle 3 Abschnitte erfolgreich erkannt und übernommen.");
    }
    onExtracted(result);
    setText("");
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50/50 p-6">
      <h3 className="text-sm font-semibold text-zinc-900">
        Alternativ: Text aus PDF einfügen
      </h3>
      <p className="mt-1 text-xs text-zinc-500">
        Falls der PDF-Upload nicht funktioniert: öffne deine PDF (z.B. in
        Preview oder Acrobat), markiere den ganzen Text mit{" "}
        <kbd className="rounded bg-zinc-200 px-1 py-0.5 text-[10px] font-mono">
          Cmd+A
        </kbd>
        , kopiere mit{" "}
        <kbd className="rounded bg-zinc-200 px-1 py-0.5 text-[10px] font-mono">
          Cmd+C
        </kbd>{" "}
        und füge hier ein. Die Abschnitte werden automatisch den Feldern unten
        zugeordnet.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (feedback) setFeedback(null);
        }}
        rows={8}
        placeholder="Hier den kompletten Berichtstext einfügen …"
        className="mt-4 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
      />
      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 text-xs text-zinc-500">
          {feedback && (
            <p
              className={
                feedback.startsWith("Alle") ? "text-emerald-700" : "text-amber-700"
              }
            >
              {feedback}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={text.trim().length === 0}
          className="shrink-0 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          In Felder übernehmen
        </button>
      </div>
    </div>
  );
}

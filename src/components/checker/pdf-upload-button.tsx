"use client";

import { useRef, useState } from "react";

import { splitReport } from "@/lib/checker/split-text";
import type { CheckerInput } from "@/lib/checker/types";

const MAX_PDF_BYTES = 15 * 1024 * 1024;

type Status =
  | { state: "idle" }
  | { state: "loading"; fileName: string }
  | {
      state: "success";
      fileName: string;
      sectionsFound: number;
      chars: number;
      rawText: string;
    }
  | { state: "error"; message: string };

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  // Wir tracken die Y-Koordinate jedes Textitems, um Zeilenumbrüche aus dem
  // PDF-Layout abzuleiten. Ohne Newlines kollabiert „Teilnahme und Mitarbeit:"
  // mit dem Folgetext in eine Zeile und unsere Heading-Regex schlägt fehl.
  // Y-Diff > 2 PDF-Punkte = neue Zeile.
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let lineParts: string[] = [];
    const lines: string[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = (item.transform as number[])[5];
      const s = item.str;
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (lineParts.length > 0) {
          lines.push(lineParts.join(" ").trim());
          lineParts = [];
        }
      }
      if (s.length > 0) lineParts.push(s);
      lastY = y;
    }
    if (lineParts.length > 0) lines.push(lineParts.join(" ").trim());
    pages.push(lines.filter((l) => l.length > 0).join("\n"));
  }

  return pages.join("\n\n").trim();
}

export function PdfUploadButton({
  onExtracted,
  warnBeforeOverwrite,
}: {
  onExtracted: (input: CheckerInput) => void;
  warnBeforeOverwrite?: () => boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [dragActive, setDragActive] = useState(false);

  async function handleFile(file: File) {
    if (warnBeforeOverwrite && !warnBeforeOverwrite()) return;

    if (file.size > MAX_PDF_BYTES) {
      setStatus({ state: "error", message: "PDF zu groß (max 15 MB)." });
      return;
    }
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setStatus({ state: "error", message: "Bitte eine PDF-Datei auswählen." });
      return;
    }

    setStatus({ state: "loading", fileName: file.name });

    try {
      const text = await extractPdfText(file);
      if (text.length < 50) {
        setStatus({
          state: "error",
          message:
            "Konnte fast keinen Text aus dem PDF lesen — wahrscheinlich ein gescanntes oder geschütztes PDF. Nutze stattdessen die Text-Einfüge-Variante unten.",
        });
        return;
      }

      const result = splitReport(text);
      let sectionsFound = [
        result.teilnahme,
        result.ablauf,
        result.fazit,
      ].filter((s) => s.trim().length > 0).length;

      // Safety net: wenn splitReport gar nichts zuordnen konnte, den
      // kompletten extrahierten Text in das erste Feld dumpen — dann hat
      // der Coach wenigstens etwas zum manuellen Aufteilen statt drei leerer
      // Felder. Besser sichtbar als wortlos verschluckt.
      if (sectionsFound === 0) {
        result.teilnahme = text;
        sectionsFound = 0;
      }

      onExtracted(result);
      setStatus({
        state: "success",
        fileName: file.name,
        sectionsFound,
        chars: text.length,
        rawText: text,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ state: "error", message: `Konnte PDF nicht lesen: ${message}` });
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragActive) setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      className={`rounded-xl border-2 border-dashed p-6 transition ${
        dragActive
          ? "border-zinc-900 bg-white"
          : "border-zinc-300 bg-zinc-50/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900">
            Bestehenden Bericht als PDF hochladen
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Word-Export-PDF auswählen oder hierher ziehen. Der Text wird{" "}
            <span className="font-medium text-zinc-700">
              ausschließlich im Browser
            </span>{" "}
            gelesen und automatisch in die drei Felder unten verteilt — die
            PDF-Datei selbst verlässt deinen Rechner nie.
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={status.state === "loading"}
          className="shrink-0 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {status.state === "loading" ? "Lese …" : "PDF auswählen"}
        </button>
      </div>

      {status.state !== "idle" && (
        <div className="mt-3 text-xs">
          {status.state === "loading" && (
            <span className="text-zinc-600">
              Lese {status.fileName} im Browser …
            </span>
          )}
          {status.state === "success" && (
            <div className="space-y-2">
              {status.sectionsFound === 3 && (
                <p className="text-emerald-700">
                  ✓ {status.fileName} eingelesen — alle 3 Abschnitte erkannt (
                  {status.chars.toLocaleString("de-DE")} Zeichen). Bitte unten
                  gegenlesen.
                </p>
              )}
              {status.sectionsFound > 0 && status.sectionsFound < 3 && (
                <p className="text-amber-700">
                  ⚠ {status.fileName} eingelesen — nur {status.sectionsFound}/3
                  Abschnitte automatisch erkannt (
                  {status.chars.toLocaleString("de-DE")} Zeichen). Bitte unten
                  gegenlesen und ggf. manuell verschieben.
                </p>
              )}
              {status.sectionsFound === 0 && (
                <p className="text-amber-700">
                  ⚠ {status.fileName} eingelesen — keine Abschnitts-Überschriften
                  erkannt. Der gesamte Text wurde ins erste Feld unten
                  übernommen, bitte manuell auf die drei Felder verteilen (
                  {status.chars.toLocaleString("de-DE")} Zeichen).
                </p>
              )}
              <details className="text-zinc-500">
                <summary className="cursor-pointer hover:text-zinc-700">
                  Extrahierten Roh-Text anzeigen
                </summary>
                <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded border border-zinc-200 bg-white p-3 text-[11px] leading-snug text-zinc-700">
                  {status.rawText}
                </pre>
              </details>
            </div>
          )}
          {status.state === "error" && (
            <span className="text-amber-700">{status.message}</span>
          )}
        </div>
      )}
    </div>
  );
}

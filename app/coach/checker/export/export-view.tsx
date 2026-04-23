"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BerDocument } from "@/components/checker/ber-document";
import { isCheckerInput, type CheckerInput } from "@/lib/checker/types";

const STORAGE_KEY = "signflow:checker-export";

export function ExportView({ coachName }: { coachName: string }) {
  const [input, setInput] = useState<CheckerInput | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let parsed: CheckerInput | null = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const maybe: unknown = JSON.parse(raw);
        if (isCheckerInput(maybe)) parsed = maybe;
      }
    } catch {
      // corrupted / missing — show fallback
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage ist External State, per Design nur client-seitig lesbar; einmaliges Sync beim Mount.
    setInput(parsed);
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!input) {
    return (
      <div className="mx-auto max-w-xl p-10 text-center">
        <h1 className="text-xl font-semibold">Kein Bericht zu exportieren</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Es liegt keine Berichts-Session vor. Bitte zuerst einen Bericht
          schreiben.
        </p>
        <Link
          href="/coach/checker/check"
          className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Zum Checker
        </Link>
      </div>
    );
  }

  return (
    <div className="export-wrapper">
      <div className="export-toolbar" data-print-hide>
        <Link
          href="/coach/checker/check"
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          ← zurück zum Checker
        </Link>
        <div className="export-toolbar-actions">
          <p className="text-xs text-zinc-500">
            Dein Bericht im Erango-Layout. Klick auf &bdquo;Als PDF
            speichern&ldquo;, dein Browser öffnet den Druckdialog — dort
            Ziel &bdquo;Als PDF speichern&ldquo; wählen.
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Als PDF speichern
          </button>
        </div>
      </div>

      <div className="export-canvas">
        <BerDocument input={input} meta={{ coachName }} />
      </div>

      <style>{toolbarCss}</style>
    </div>
  );
}

const toolbarCss = `
  .export-wrapper {
    background: #f4f4f5;
    min-height: 100vh;
    padding: 0 0 8mm 0;
  }
  .export-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    max-width: 210mm;
    margin: 0 auto;
    padding: 4mm 10mm;
  }
  .export-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .export-toolbar-actions p {
    margin: 0;
    max-width: 40ch;
    text-align: right;
  }
  .export-canvas {
    max-width: 210mm;
    margin: 0 auto;
    background: white;
    box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  }
  @media print {
    .export-wrapper {
      background: #fff;
      padding: 0;
    }
    .export-canvas {
      box-shadow: none;
      max-width: none;
    }
    [data-print-hide] {
      display: none !important;
    }
  }
`;

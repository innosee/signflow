"use client";

import { useState, useTransition } from "react";

import {
  submitAdhocBerAction,
  type AdhocBerInput,
} from "@/lib/checker/adhoc-actions";
import type { CheckerInput, CheckerResult } from "@/lib/checker/types";

type Props = {
  input: CheckerInput;
  result: CheckerResult;
  /** Optionales 4. Freitext-Feld (AVGS-Inhalte / Sonstiges). */
  sonstiges: string;
  coachName: string;
  /**
   * Wenn nicht-leer: der Coach hat im Sidebar/Editor explizit angegeben,
   * dass nicht alle Pflicht-Bausteine in dieser Maßnahme abdeckbar sind
   * + eine Begründung gegeben. Erlaubt der Server den Submit auch wenn
   * `result.status === "needs_revision"` ausschließlich wegen fehlender
   * mustHaves wäre.
   */
  mustHaveOverrideReason: string | null;
  onSubmitted: (berId: string) => void;
  onCancel: () => void;
};

type FormState = {
  tnVorname: string;
  tnNachname: string;
  tnKundenNr: string;
  tnAvgsNummer: string;
  tnZeitraum: string;
  tnUe: string;
  keineFehlzeiten: boolean;
};

const EMPTY_FORM: FormState = {
  tnVorname: "",
  tnNachname: "",
  tnKundenNr: "",
  tnAvgsNummer: "",
  tnZeitraum: "",
  tnUe: "",
  keineFehlzeiten: false,
};

export function AdhocSubmitForm({
  input,
  result,
  sonstiges,
  coachName,
  mustHaveOverrideReason,
  onSubmitted,
  onCancel,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  }

  function handleSubmit() {
    if (form.tnVorname.trim().length === 0) {
      setError("Vorname ist Pflicht.");
      return;
    }
    if (form.tnNachname.trim().length === 0) {
      setError("Nachname ist Pflicht.");
      return;
    }
    const payload: AdhocBerInput = {
      tnVorname: form.tnVorname,
      tnNachname: form.tnNachname,
      tnKundenNr: form.tnKundenNr,
      tnAvgsNummer: form.tnAvgsNummer,
      tnZeitraum: form.tnZeitraum,
      tnUe: form.tnUe,
      keineFehlzeiten: form.keineFehlzeiten,
      sonstiges,
      mustHaveOverrideReason,
      input,
      result,
    };
    startTransition(async () => {
      try {
        const res = await submitAdhocBerAction(payload);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onSubmitted(res.berId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Schnell-Check submit failed:", err);
        setError(
          `Einreichen fehlgeschlagen: ${msg}. Bitte versuche es erneut, oder lade die Seite neu (Cmd+Shift+R).`,
        );
      }
    });
  }

  // Wir verwenden bewusst `<div>` statt `<form>` — dieser Submit-Block sitzt
  // INNERHALB der äußeren Checker-Form, und HTML verbietet verschachtelte
  // <form>-Tags (führt sonst zum Hydration-Error und Submit-Events werden
  // stumm geschluckt). Submit läuft über Button-Click + Enter-Handler je
  // Input. Enter darf NICHT zur äußeren Form bubblen, sonst würde stattdessen
  // „Erneut prüfen" feuern.
  function handleEnterKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    }
  }

  return (
    <div className="rounded-xl border border-zinc-300 bg-zinc-50/40 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-zinc-900">
          An Bildungsträger einreichen
        </h3>
        <p className="mt-1 text-xs text-zinc-600">
          Bitte ergänze die Teilnehmer-Daten. Sie werden direkt mit dem Bericht
          gespeichert — der Bildungsträger findet den fertigen Bericht
          anschließend in seiner Übersicht. Coach: {coachName}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Vorname *"
          value={form.tnVorname}
          onChange={(v) => update("tnVorname", v)}
          onKeyDown={handleEnterKey}
          autoComplete="off"
          autoFocus
        />
        <Field
          label="Nachname *"
          value={form.tnNachname}
          onChange={(v) => update("tnNachname", v)}
          onKeyDown={handleEnterKey}
          autoComplete="off"
        />
        <Field
          label="Kunden-Nr."
          value={form.tnKundenNr}
          onChange={(v) => update("tnKundenNr", v)}
          onKeyDown={handleEnterKey}
          placeholder="z.B. 160B29588"
          autoComplete="off"
        />
        <Field
          label="AVGS-Nummer"
          value={form.tnAvgsNummer}
          onChange={(v) => update("tnAvgsNummer", v)}
          onKeyDown={handleEnterKey}
          autoComplete="off"
        />
        <Field
          label="Zeitraum"
          value={form.tnZeitraum}
          onChange={(v) => update("tnZeitraum", v)}
          onKeyDown={handleEnterKey}
          placeholder="z.B. 03.03.2026 — 26.04.2026"
          autoComplete="off"
        />
        <Field
          label="Gesamt UE"
          value={form.tnUe}
          onChange={(v) => update("tnUe", v)}
          onKeyDown={handleEnterKey}
          placeholder="z.B. 72"
          autoComplete="off"
        />
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-zinc-800 cursor-pointer">
        <input
          type="checkbox"
          checked={form.keineFehlzeiten}
          onChange={(e) => update("keineFehlzeiten", e.target.checked)}
          className="h-4 w-4 accent-zinc-900"
        />
        <span>Keine Fehlzeiten</span>
        <span className="text-xs text-zinc-500">
          (erscheint im PDF-Header als Markierung)
        </span>
      </label>

      {mustHaveOverrideReason && mustHaveOverrideReason.trim().length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-medium">
            Pflicht-Baustein-Override aktiv:
          </span>{" "}
          &bdquo;{mustHaveOverrideReason}&ldquo;. Wird im PDF und im
          Bildungsträger-Detail-View sichtbar.
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-rose-700" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isPending ? "Reiche ein …" : "Einreichen + PDF anzeigen →"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onKeyDown,
  placeholder,
  autoComplete,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-zinc-800">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
      />
    </label>
  );
}

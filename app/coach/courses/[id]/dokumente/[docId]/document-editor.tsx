"use client";

import { useActionState } from "react";

import {
  getDocumentConfig,
  MASTER_FIELD_LABELS,
  type DocumentTypeId,
  type ParticipantMasterField,
} from "@/lib/documents/config";
import {
  saveDocumentDraft,
  signDocumentAsCoach,
} from "../actions";

type MasterData = Partial<Record<ParticipantMasterField, string>>;

type Props = {
  documentId: string;
  type: DocumentTypeId;
  status: "draft" | "active" | "completed";
  formData: Record<string, string>;
  master: MasterData;
  participantSigned: boolean;
  hasCoachSignature: boolean;
};

const MASTER_FIELD_ORDER: ParticipantMasterField[] = [
  "vorname",
  "nachname",
  "strasse",
  "plz",
  "ort",
  "geburtsdatum",
  "geburtsort",
  "phone",
  "festnetz",
];

export function DocumentEditor({
  documentId,
  type,
  status,
  formData,
  master,
  participantSigned,
  hasCoachSignature,
}: Props) {
  const cfg = getDocumentConfig(type);
  const [saveState, saveAction, saving] = useActionState(
    saveDocumentDraft,
    undefined,
  );
  const [signState, signAction, signing] = useActionState(
    signDocumentAsCoach,
    undefined,
  );

  if (status !== "draft") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <p className="font-medium text-zinc-900">
          {status === "completed"
            ? "✓ Abgeschlossen — von Coach und Teilnehmer:in signiert."
            : "Vom Coach signiert — wartet auf die Teilnehmer-Unterschrift."}
        </p>
        <p className="mt-1 text-zinc-600">
          {participantSigned
            ? "Die Teilnehmer:in hat unterschrieben."
            : "Die Teilnehmer:in unterschreibt über ihren Magic-Link im Bereich Dokumente. Löse bei Bedarf auf der Kursseite Teilnehmer benachrichtigen aus."}
        </p>
      </div>
    );
  }

  const requiresMaster = cfg.requiredMasterData.length > 0;

  return (
    <div className="space-y-6">
      {/* Ein Formular speichert Felder + Stammdaten gemeinsam. */}
      <form action={saveAction} className="space-y-5">
        <input type="hidden" name="documentId" value={documentId} />

        {requiresMaster && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-zinc-900">
              Teilnehmer-Stammdaten
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Einmal erfasst — für alle Dokumente dieses Kunden wiederverwendbar.
              Pflichtfelder sind markiert.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {MASTER_FIELD_ORDER.map((f) => {
                const required = cfg.requiredMasterData.includes(f);
                return (
                  <label key={f} className="block text-xs">
                    <span className="text-zinc-700">
                      {MASTER_FIELD_LABELS[f]}
                      {required && <span className="text-red-600"> *</span>}
                    </span>
                    <input
                      type={f === "geburtsdatum" ? "date" : "text"}
                      name={f}
                      defaultValue={master[f] ?? ""}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm"
                    />
                  </label>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-900">Formularfelder</h3>
          <div className="mt-3 space-y-3">
            {cfg.fields.map((field) => (
              <label key={field.key} className="block text-xs">
                <span className="text-zinc-700">
                  {field.label}
                  {field.required && <span className="text-red-600"> *</span>}
                </span>
                {field.hint && (
                  <span className="mt-0.5 block text-[11px] text-zinc-400">
                    {field.hint}
                  </span>
                )}
                {field.type === "textarea" ? (
                  <textarea
                    name={field.key}
                    defaultValue={formData[field.key] ?? ""}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm"
                  />
                ) : field.type === "select" ? (
                  <select
                    name={field.key}
                    defaultValue={formData[field.key] ?? ""}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm"
                  >
                    {field.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === "date" ? "date" : "text"}
                    name={field.key}
                    defaultValue={formData[field.key] ?? ""}
                    placeholder={field.placeholder}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm"
                  />
                )}
              </label>
            ))}
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-800 enabled:hover:bg-zinc-50 disabled:opacity-40"
          >
            {saving ? "Speichert…" : "Entwurf speichern"}
          </button>
          {saveState?.success && (
            <span className="text-xs text-green-700">✓ gespeichert</span>
          )}
          {saveState?.error && (
            <span role="alert" className="text-xs text-red-700">
              {saveState.error}
            </span>
          )}
        </div>
      </form>

      {/* Coach-Signatur (immer zuerst). */}
      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <h3 className="text-sm font-semibold text-zinc-900">
          Als Coach unterschreiben
        </h3>
        <p className="mt-0.5 text-xs text-zinc-600">
          Speichere zuerst deine Eingaben. Mit der Signatur werden die Feld- und
          Stammdaten eingefroren und das Dokument für die Teilnehmer-Unterschrift
          freigegeben.
        </p>
        {!hasCoachSignature && (
          <p className="mt-2 text-xs text-red-700">
            Du hast noch keine Unterschrift hinterlegt — lege sie unter
            &bdquo;Unterschrift&ldquo; an.
          </p>
        )}
        <form action={signAction} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="documentId" value={documentId} />
          <label className="flex items-start gap-2 text-xs text-zinc-700">
            <input type="checkbox" name="confirm" required className="mt-0.5" />
            <span>Ich bestätige die Angaben und unterschreibe dieses Dokument.</span>
          </label>
          <button
            type="submit"
            disabled={signing || !hasCoachSignature}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white enabled:hover:bg-zinc-800 disabled:opacity-40"
          >
            {signing ? "…" : "Unterschreiben"}
          </button>
          {signState?.error && (
            <span role="alert" className="text-xs text-red-700">
              {signState.error}
            </span>
          )}
        </form>
      </section>
    </div>
  );
}

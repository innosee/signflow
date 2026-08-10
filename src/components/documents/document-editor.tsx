"use client";

import { useActionState } from "react";

import {
  getDocumentConfig,
  MASTER_FIELD_DATE,
  MASTER_FIELD_LABELS,
  MASTER_FIELD_ORDER,
  type DocumentTypeId,
  type ParticipantMasterField,
} from "@/lib/documents/config";

import { AnalogDocConfirm } from "./analog-doc-confirm";

type MasterData = Partial<Record<ParticipantMasterField, string>>;

/**
 * Rückgabe-Form der Editor-Server-Action (Coach ODER Bildungsträger). `values`
 * ist das Werte-Echo bei Fehler (kein React-19-Form-Reset).
 */
export type DocumentEditorState =
  | {
      error?: string;
      success?: boolean;
      values?: Record<string, string>;
    }
  | undefined;

export type DocumentEditorAction = (
  prev: DocumentEditorState,
  formData: FormData,
) => Promise<DocumentEditorState>;

type Props = {
  documentId: string;
  type: DocumentTypeId;
  status: "draft" | "active" | "completed";
  formData: Record<string, string>;
  master: MasterData;
  participantSigned: boolean;
  /** Ob eine zweite (erango-seitige) Unterschrift hinterlegt ist. */
  hasSignerSignature: boolean;
  /** Server-Action der jeweiligen Rolle (Coach- bzw. BT-Route). */
  submitAction: DocumentEditorAction;
  /**
   * Wer das Formular ausfüllt: Coach signiert persönlich, der Bildungsträger
   * mit der geteilten Org-Unterschrift. Steuert nur die Texte.
   */
  role: "coach" | "bildungstraeger";
  /** Pfad zur Unterschrift-Setup-Seite (Rollen-spezifisch). */
  signatureHref: string;
  /**
   * Analog-Modus (Kurs `signature_mode = 'analog'`): kein digitales Signieren,
   * kein Magic-Link. Die Freigabe friert nur den Inhalt ein; danach lädt der
   * Owner den unterschriebenen Papier-Scan hoch.
   */
  analog?: boolean;
  /** Analog: Server-Action zum Scan-Upload/Abschluss (nur im Analog-Modus). */
  confirmAnalogAction?: DocumentEditorAction;
  /** Analog: Download-Link für das leere Formular-PDF (zum Ausdrucken). */
  blankPdfUrl?: string;
};

export function DocumentEditor({
  documentId,
  type,
  status,
  formData,
  master,
  participantSigned,
  hasSignerSignature,
  submitAction,
  role,
  signatureHref,
  analog = false,
  confirmAnalogAction,
  blankPdfUrl,
}: Props) {
  const cfg = getDocumentConfig(type);
  const coachSigns = cfg.signers.coach;
  const [state, action, pending] = useActionState(submitAction, undefined);

  const signatureNoun =
    role === "bildungstraeger" ? "Bildungsträger-Unterschrift" : "Unterschrift";

  if (status !== "draft") {
    // Analog-Modus: nach der Freigabe (Inhalt eingefroren) lädt der Owner den
    // unterschriebenen Papier-Scan hoch, statt auf eine digitale
    // Teilnehmer-Unterschrift zu warten.
    if (analog) {
      return (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          {status === "completed" ? (
            <>
              <p className="font-medium text-zinc-900">
                ✓ Abgeschlossen — unterschriebener Scan abgelegt.
              </p>
              <p className="mt-1 text-zinc-600">
                Der Papier-Scan ist hinterlegt und wird als finales Dokument-PDF
                ausgeliefert.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-zinc-900">
                Freigegeben (Inhalt eingefroren) — auf Papier unterschreiben.
              </p>
              <p className="mt-1 mb-3 text-zinc-600">
                Analog-Modus: Bitte das Formular ausdrucken, unterschreiben
                lassen und den Scan hochladen.
              </p>
              {confirmAnalogAction && blankPdfUrl && (
                <AnalogDocConfirm
                  documentId={documentId}
                  confirmAction={confirmAnalogAction}
                  blankPdfUrl={blankPdfUrl}
                />
              )}
            </>
          )}
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <p className="font-medium text-zinc-900">
          {status === "completed"
            ? "✓ Abgeschlossen — von beiden Seiten unterschrieben."
            : "Unterschrieben & freigegeben — wartet auf die Teilnehmer-Unterschrift."}
        </p>
        <p className="mt-1 text-zinc-600">
          {participantSigned
            ? "Die Teilnehmer:in hat unterschrieben."
            : "Die Teilnehmer:in wurde per E-Mail mit ihrem Signier-Link benachrichtigt und unterschreibt über den Bereich Dokumente. Auf der Kursseite kann der Link bei Bedarf erneut gesendet werden."}
        </p>
        {status === "active" && !participantSigned && (
          <p className="mt-2 text-xs text-zinc-500">
            Tippfehler entdeckt? Solange die Teilnehmer:in noch nicht
            unterschrieben hat, kannst du das Dokument oben über
            &bdquo;Bearbeiten (Korrektur)&ldquo; wieder öffnen, korrigieren und
            neu freigeben.
          </p>
        )}
      </div>
    );
  }

  const requiresMaster = cfg.requiredMasterData.length > 0;
  const showMaster = requiresMaster || type === "f08_tnv";

  // Bei Fehler gibt die Action die abgeschickten Werte zurück (`state.values`),
  // damit React 19 das Formular nicht auf die alten defaultValues zurücksetzt
  // und getippte Eingaben verschwinden (siehe AGENTS.md / docs/forms-server-actions).
  const echo = state?.values ?? {};

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="documentId" value={documentId} />

      {showMaster && (
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
                    type={MASTER_FIELD_DATE.has(f) ? "date" : "text"}
                    // Namensraum `m_` verhindert Kollision mit Formularfeldern,
                    // die denselben Schlüssel tragen können (z.B. `ort`:
                    // Wohnort in den Stammdaten vs. Durchführungsort im Formular).
                    name={`m_${f}`}
                    defaultValue={echo[`m_${f}`] ?? master[f] ?? ""}
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
                  defaultValue={echo[field.key] ?? formData[field.key] ?? ""}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm"
                />
              ) : field.type === "select" ? (
                <select
                  name={field.key}
                  defaultValue={echo[field.key] ?? formData[field.key] ?? ""}
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
                  defaultValue={echo[field.key] ?? formData[field.key] ?? ""}
                  placeholder={field.placeholder}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm"
                />
              )}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-xs text-zinc-600">
          {analog
            ? "Analog-Modus: Mit der Freigabe werden die Angaben eingefroren. Danach das Formular ausdrucken, auf Papier unterschreiben lassen und den Scan hochladen — keine E-Mail an die Teilnehmer:in."
            : coachSigns
              ? "Mit dem Unterschreiben werden die Angaben eingefroren, das Dokument freigegeben und die Teilnehmer:in automatisch per E-Mail mit ihrem Signier-Link benachrichtigt."
              : "Mit der Freigabe werden die Angaben eingefroren und die Teilnehmer:in automatisch per E-Mail mit ihrem Signier-Link benachrichtigt."}
        </p>
        {coachSigns && !hasSignerSignature && !analog && (
          <p className="mt-2 text-xs text-red-700">
            Es ist noch keine {signatureNoun} hinterlegt — lege sie unter{" "}
            <a href={signatureHref} className="underline">
              &bdquo;Unterschrift&ldquo;
            </a>{" "}
            an.
          </p>
        )}

        <label className="mt-3 flex items-start gap-2 text-xs text-zinc-700">
          <input type="checkbox" name="confirm" className="mt-0.5" />
          <span>
            {analog
              ? "Ich bestätige die Angaben und friere sie für den Papier-Druck ein."
              : coachSigns
                ? "Ich bestätige die Angaben und unterschreibe dieses Dokument."
                : "Ich bestätige die Angaben und gebe das Dokument frei."}
          </span>
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={pending}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-800 enabled:hover:bg-zinc-50 disabled:opacity-40"
          >
            {pending ? "…" : "Entwurf speichern"}
          </button>
          <button
            type="submit"
            name="intent"
            value="release"
            disabled={pending || (coachSigns && !hasSignerSignature && !analog)}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white enabled:hover:bg-zinc-800 disabled:opacity-40"
          >
            {analog
              ? "Freigeben (für Papier)"
              : coachSigns
                ? "Unterschreiben & freigeben"
                : "An Teilnehmer freigeben"}
          </button>
          {state?.success && (
            <span className="text-xs text-green-700">✓ gespeichert</span>
          )}
          {state?.error && (
            <span role="alert" className="text-xs text-red-700">
              {state.error}
            </span>
          )}
        </div>
      </section>
    </form>
  );
}

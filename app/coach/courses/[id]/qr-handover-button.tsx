"use client";

import { useCallback, useEffect, useState } from "react";

import { createParticipantQrLink } from "./actions";

type QrState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string; qrDataUrl: string }
  | { status: "error"; message: string };

/**
 * QR-Handover-Button: pro TN-Zeile sichtbar, öffnet ein Modal mit dem
 * frisch generierten Magic-Link als QR-Code. Coach hält dem TN den
 * Bildschirm hin, TN scannt mit Kamera → öffnet Sign-Page.
 *
 * Behavioral note: jedes Öffnen erzeugt einen neuen Token und
 * invalidiert ältere Magic-Links für diesen TN — dasselbe Verhalten
 * wie ein Notify-Click. Modal sagt das transparent.
 */
export function QrHandoverButton({
  courseId,
  participantId,
  participantName,
}: {
  courseId: string;
  participantId: string;
  participantName: string;
}) {
  const [state, setState] = useState<QrState>({ status: "idle" });
  const [open, setOpen] = useState(false);

  const openModal = useCallback(async () => {
    setOpen(true);
    setState({ status: "loading" });
    const result = await createParticipantQrLink({ courseId, participantId });
    // TS-Discriminator über `error?: undefined` reicht für Narrowing nicht —
    // explizit auf die Success-Felder prüfen.
    if (!result.url || !result.qrDataUrl) {
      setState({
        status: "error",
        message: result.error ?? "Unbekannter Fehler bei der QR-Erzeugung.",
      });
      return;
    }
    setState({
      status: "ready",
      url: result.url,
      qrDataUrl: result.qrDataUrl,
    });
  }, [courseId, participantId]);

  const close = useCallback(() => {
    setOpen(false);
    setState({ status: "idle" });
  }, []);

  // Escape-Key schließt das Modal — Tastatur-Bedienbarkeit für Coach,
  // der den Bildschirm dem TN hingehalten hat und schnell wieder ans
  // Notebook ranmuss.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title={`QR-Code für ${participantName} anzeigen`}
        className="text-zinc-700 underline-offset-2 hover:underline text-xs"
      >
        QR
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Magic-Link-QR für ${participantName}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-950">
                  QR-Code für {participantName}
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Mit der Handy-Kamera scannen lassen. Der Link öffnet die
                  Sign-Page direkt.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Schließen"
                className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              >
                ×
              </button>
            </div>

            <div className="mt-6 flex items-center justify-center">
              {state.status === "loading" && (
                <div className="grid h-80 w-80 place-items-center text-sm text-zinc-500">
                  Code wird erzeugt…
                </div>
              )}
              {state.status === "ready" && (
                <img
                  src={state.qrDataUrl}
                  alt={`Magic-Link-QR-Code für ${participantName}`}
                  width={320}
                  height={320}
                  className="rounded-lg"
                />
              )}
              {state.status === "error" && (
                <div className="grid h-80 w-80 place-items-center px-6 text-center text-sm text-red-700">
                  {state.message}
                </div>
              )}
            </div>

            {state.status === "ready" && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-zinc-500">
                  Falls Scannen nicht klappt: Link direkt öffnen
                </p>
                <p className="break-all rounded-md bg-zinc-50 px-3 py-2 font-mono text-[11px] text-zinc-700">
                  {state.url}
                </p>
              </div>
            )}

            <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
              Hinweis: Mit dem Öffnen dieses QR wurden ältere Magic-Links für
              {" "}{participantName} ungültig. Der Code ist 24 Stunden gültig
              und einmalig.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

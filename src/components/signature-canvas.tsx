"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";

type Props = {
  /** Label für den Submit-Button. */
  submitLabel?: string;
  /**
   * Ziel-Endpoint, dem das PNG als `signature`-Feld geschickt wird.
   * Der Endpoint muss mit `{ url: string }` oder `{ error: string }` antworten.
   */
  action: string;
  /** Wird mit der zurückgegebenen URL aufgerufen, sobald der Upload erfolgreich war. */
  onUploaded?: (url: string) => void;
  /** Optionale Einleitung über dem Canvas. */
  hint?: string;
};

/**
 * Kleines Canvas-Widget für die Erfassung einer handschriftlichen Unterschrift.
 * Nutzt `signature_pad` für sauberes Bézier-Tracing + korrekte Touch-Events.
 *
 * Das PNG wird an den per `action` gesetzten Endpoint geschickt — die Component
 * ist damit wiederverwendbar für Coach (`/api/signatures/me`) und perspektivisch
 * auch für den Teilnehmer-Upload.
 */
export function SignatureCanvas({
  submitLabel = "Unterschrift speichern",
  action,
  onUploaded,
  hint,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [status, setStatus] = useState<"idle" | "uploading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  // Canvas auf sein Layout-Rect skalieren und dabei DPR berücksichtigen,
  // sonst malt signature_pad auf einem intern zu kleinen Buffer und die
  // Linie wirkt stark gepixelt.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);
    padRef.current?.clear();
    setIsEmpty(true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, {
      minWidth: 0.8,
      maxWidth: 2.2,
      backgroundColor: "rgba(255,255,255,1)",
      penColor: "#111",
    });
    padRef.current = pad;
    pad.addEventListener("endStroke", () => setIsEmpty(pad.isEmpty()));
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
      padRef.current = null;
    };
  }, [resize]);

  const clear = () => {
    padRef.current?.clear();
    setIsEmpty(true);
    setStatus("idle");
    setError(null);
  };

  const save = async () => {
    const pad = padRef.current;
    const canvas = canvasRef.current;
    if (!pad || !canvas || pad.isEmpty()) return;

    setStatus("uploading");
    setError(null);
    try {
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
          "image/png",
        );
      });
      const fd = new FormData();
      fd.append("signature", blob, "signature.png");
      const res = await fetch(action, { method: "POST", body: fd });
      const payload = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !payload.url) {
        throw new Error(payload.error ?? `Upload fehlgeschlagen (${res.status}).`);
      }
      setStatus("done");
      onUploaded?.(payload.url);
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    }
  };

  return (
    <div className="space-y-3">
      {hint && <p className="text-sm text-zinc-600">{hint}</p>}
      <div className="rounded-lg border border-zinc-400 bg-white">
        <canvas
          ref={canvasRef}
          className="block h-48 w-full touch-none rounded-lg"
          aria-label="Unterschriftsfeld"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isEmpty || status === "uploading"}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          {status === "uploading" ? "Wird gespeichert…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={status === "uploading"}
          className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-40"
        >
          Zurücksetzen
        </button>
        {status === "done" && (
          <span className="text-xs text-green-700">✓ gespeichert</span>
        )}
      </div>
    </div>
  );
}

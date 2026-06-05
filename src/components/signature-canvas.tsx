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
  /**
   * Zusätzliche FormData-Felder (z.B. `token`) die neben `signature`
   * mit-gepostet werden. Wird für Magic-Link-authentifizierte Endpoints
   * genutzt, bei denen kein Cookie-Session verfügbar ist.
   */
  extraFields?: Record<string, string>;
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
  extraFields,
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
      // Stroke-Tuning für eine satter wirkende Linie auf Touch + Maus.
      // - throttle senkt die Sampling-Rate auf 16ms (~60Hz) und filtert
      //   doppelte Punkte raus, die signature_pad sonst als 0-Distanz-
      //   Bézier-Schnipsel zeichnet (sieht „ribbed" aus).
      // - velocityFilterWeight 0.5 (Default 0.7) reagiert schneller auf
      //   Geschwindigkeitsänderungen → Anstriche/Aufstriche wirken
      //   stärker, Linien lebendiger statt gleichmäßig dick.
      minWidth: 0.6,
      maxWidth: 2.6,
      throttle: 16,
      velocityFilterWeight: 0.5,
      // Transparenter Hintergrund → das exportierte PNG legt sich überall
      // sauber auf (Stundennachweis-Hintergrund, dunkles Theme-Preview,
      // PDF-Tabelle), kein weißer Block der die Zelle überlappt.
      backgroundColor: "rgba(0,0,0,0)",
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
      const trimmed = trimToContent(canvas);
      const blob: Blob = await new Promise((resolve, reject) => {
        trimmed.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
          "image/png",
        );
      });
      const fd = new FormData();
      fd.append("signature", blob, "signature.png");
      if (extraFields) {
        for (const [key, value] of Object.entries(extraFields)) {
          fd.append(key, value);
        }
      }
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

/**
 * Schneidet das Canvas auf die Bounding-Box der tatsächlich gezeichneten
 * Pixel zu (Alpha > 0). Begründung: das Roh-Canvas ist immer die volle
 * Widget-Fläche, d.h. die Signatur landet als kleiner Klecks in einem
 * großen leeren PNG. Bei der Einbettung in den Stundennachweis (Tabellen-
 * Zelle, max-height ~14mm) skaliert das Bild dann nicht auf die Linie
 * selbst sondern auf den Whitespace → Signatur erscheint winzig und
 * mittig in der Zelle. Trim löst das ohne die UI-Größe zu ändern.
 *
 * Ein kleiner Padding-Rand bleibt erhalten, damit Pen-Anstriche an der
 * Bounding-Box-Kante nicht abrasiert wirken.
 */
function trimToContent(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = source.getContext("2d");
  if (!ctx) return source;
  const { width, height } = source;
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;

  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;

  // Wir checken nur den Alpha-Kanal (Index 3 pro Pixel) — funktioniert nur
  // korrekt, weil der signature_pad-Background auf transparent steht. Bei
  // weißem Hintergrund würde alles als "Content" gewertet.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha && alpha > 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (bottom < 0) return source; // gar nichts gezeichnet → Caller bricht eh ab

  // Kleiner Atem-Rand, damit der Stift-Anstrich nicht direkt an der Kante
  // klebt. 4px im Canvas-Raster ist bei DPR=2 ~2 logische px — unsichtbar,
  // aber rettet feine Aufstriche.
  const pad = 4;
  const cropX = Math.max(0, left - pad);
  const cropY = Math.max(0, top - pad);
  const cropW = Math.min(width - cropX, right - left + 1 + pad * 2);
  const cropH = Math.min(height - cropY, bottom - top + 1 + pad * 2);

  const out = document.createElement("canvas");
  out.width = cropW;
  out.height = cropH;
  const outCtx = out.getContext("2d");
  if (!outCtx) return source;
  outCtx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return out;
}

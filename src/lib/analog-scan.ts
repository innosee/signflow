import "server-only";

import { NextResponse } from "next/server";

import { resolveAssetUrl } from "@/lib/storage";

/**
 * Analog-Modus: Liefert den hochgeladenen, händisch unterschriebenen Scan (PDF)
 * als Download-Response — statt des HTML-Renders. Wird von den ANW- und
 * Dokument-PDF-Endpoints benutzt, sobald ein Scan bestätigt wurde
 * (`analog_scan_url` gesetzt).
 *
 * `scanKeyOrUrl` ist der in der DB gespeicherte Object-Key (R2) oder eine
 * Legacy-URL; `resolveAssetUrl` macht daraus eine abrufbare (signierte) URL.
 * Wir holen die Bytes serverseitig und streamen sie mit sauberem Dateinamen an
 * den Browser (statt eines Redirects auf die kurzlebige signierte URL). Gibt
 * `null` zurück, wenn die URL nicht auflösbar oder der Abruf fehlschlägt — der
 * Aufrufer fällt dann auf den normalen Render-Pfad zurück.
 */
export async function streamAnalogScan(
  scanKeyOrUrl: string,
  filename: string,
): Promise<NextResponse | null> {
  const url = await resolveAssetUrl(scanKeyOrUrl);
  if (!url) return null;

  let bytes: Uint8Array;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("streamAnalogScan: fetch not ok", res.status);
      return null;
    }
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    console.error("streamAnalogScan: fetch failed", err);
    return null;
  }

  return new NextResponse(bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

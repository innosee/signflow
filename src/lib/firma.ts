import "server-only";

import crypto from "node:crypto";

/**
 * Firma.dev Client — **aktuell komplett gemockt**, bis der echte Account
 * eingerichtet ist. Interface ist bewusst minimal gehalten (ein einziger
 * Call pro Kurs, siehe CLAUDE.md → FES), damit der spätere Real-Swap
 * eine reine Implementation-Austausch-Aufgabe ist.
 *
 * Real-Flow (TODO):
 *   1. `POST /envelopes` mit PDF + Signer-Daten (Coach)
 *   2. Poll oder Webhook → `completed`
 *   3. `GET /envelopes/:id/pdf` → gesiegeltes PDF zurück
 *
 * Mock-Flow:
 *   - `sealWithFes()` gibt synchron einen Fake-Envelope-Status
 *     `"completed"` zurück und liefert die ursprüngliche PDF-URL einfach
 *     weiter — realistisch genug, um den UI-Flow end-to-end zu testen,
 *     ohne externen Service.
 */

export type FesSealResult = {
  envelopeId: string;
  /** 'completed' im Mock, echter Client muss ggf. 'sent' mit Webhook-Upgrade liefern. */
  status: "sent" | "completed";
  /**
   * URL zum (gesiegelten) PDF. Im Mock identisch zur Input-URL — im
   * Real-Client wäre das das modifizierte PDF mit eingebetteter FES.
   */
  signedPdfUrl: string;
};

export type FesSealInput = {
  pdfUrl: string;
  /** Name des Siegelnden (Coach), für Envelope-Metadata. */
  signerName: string;
  /** E-Mail des Siegelnden, für Envelope-Metadata. */
  signerEmail: string;
  /** Kurs-Titel, rein für Logging/Nachvollziehbarkeit. */
  courseTitle: string;
};

function isMockMode(): boolean {
  // Explizites Opt-In: sobald FIRMA_DEV_API_KEY + FIRMA_DEV_MODE=live
  // gesetzt sind, würde der Real-Flow greifen. Default = Mock, damit
  // Dev/Preview-Deployments ohne externe API laufen.
  return process.env.FIRMA_DEV_MODE !== "live";
}

export async function sealWithFes(input: FesSealInput): Promise<FesSealResult> {
  if (isMockMode()) {
    // Mock-Envelope-ID so formatieren, dass sie in Logs sofort als Fake
    // erkennbar ist — hilft bei Debugging, falls jemand versehentlich
    // annimmt, das Siegel wäre echt.
    const envelopeId = `mock_env_${crypto.randomBytes(8).toString("hex")}`;
    console.info(
      `[firma.dev mock] sealed course "${input.courseTitle}" → ${envelopeId}`,
    );
    // Distinct URL zurückgeben, damit im Audit-/UI-Layer klar ist: der
    // gespeicherte Artefakt-Link ist NICHT identisch mit dem (mutable)
    // Input-PDF. Im Live-Modus wäre das der Firma.dev-Signed-PDF-Link
    // nach Upload in unseren Storage — im Mock reicht ein Query-Param
    // mit Envelope-ID als Marker.
    const sep = input.pdfUrl.includes("?") ? "&" : "?";
    return {
      envelopeId,
      status: "completed",
      signedPdfUrl: `${input.pdfUrl}${sep}sealed=${envelopeId}`,
    };
  }

  throw new Error(
    "firma.dev live mode not yet implemented — set FIRMA_DEV_MODE=mock or unset it",
  );
}

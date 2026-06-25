import "server-only";

import crypto from "node:crypto";

/**
 * FES-Siegel-Client — **aktuell komplett gemockt**, bis das D-Trust-Cert
 * (via PSW Group, self-hosted PAdES) eingerichtet ist. Interface ist bewusst
 * minimal gehalten (ein einziger Call pro Kurs, siehe CLAUDE.md → FES), damit
 * der spätere Real-Swap eine reine Implementation-Austausch-Aufgabe ist.
 *
 * Anbieter: D-Trust-Siegel (AES) via PSW Group, self-hosted PAdES — das PDF
 * verlässt unsere Infrastruktur nie (Details: Memory `project_fes_provider_decision`).
 *
 * Real-Flow (TODO):
 *   1. PDF laden, PAdES-Signatur mit dem D-Trust-Cert lokal applizieren
 *   2. gesiegeltes PDF in unseren Storage zurückschreiben
 *   3. signedPdfUrl + Envelope-/Referenz-ID zurückgeben
 *
 * Mock-Flow:
 *   - `sealWithFes()` gibt synchron einen Fake-Envelope-Status
 *     `"completed"` zurück und liefert die ursprüngliche PDF-URL einfach
 *     weiter — realistisch genug, um den UI-Flow end-to-end zu testen,
 *     ohne externes Cert.
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
  // Explizites Opt-In: sobald das D-Trust-Cert eingerichtet und FES_MODE=live
  // gesetzt ist, würde der Real-Flow greifen. Default = Mock, damit
  // Dev/Preview-Deployments ohne Cert laufen.
  return process.env.FES_MODE !== "live";
}

export async function sealWithFes(input: FesSealInput): Promise<FesSealResult> {
  if (isMockMode()) {
    // Mock-Envelope-ID so formatieren, dass sie in Logs sofort als Fake
    // erkennbar ist — hilft bei Debugging, falls jemand versehentlich
    // annimmt, das Siegel wäre echt.
    const envelopeId = `mock_env_${crypto.randomBytes(8).toString("hex")}`;
    console.info(
      `[fes mock] sealed course "${input.courseTitle}" → ${envelopeId}`,
    );
    // Distinct URL zurückgeben, damit im Audit-/UI-Layer klar ist: der
    // gespeicherte Artefakt-Link ist NICHT identisch mit dem (mutable)
    // Input-PDF. Im Live-Modus wäre das der Link auf das self-hosted
    // PAdES-gesiegelte PDF in unserem Storage — im Mock reicht ein
    // Query-Param mit Envelope-ID als Marker.
    const sep = input.pdfUrl.includes("?") ? "&" : "?";
    return {
      envelopeId,
      status: "completed",
      signedPdfUrl: `${input.pdfUrl}${sep}sealed=${envelopeId}`,
    };
  }

  throw new Error(
    "FES live mode not yet implemented — set FES_MODE=mock or unset it",
  );
}

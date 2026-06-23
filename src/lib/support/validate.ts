import type { SupportMessage } from "./azure-chat";

// Begrenzungen, damit ein manipulierter Client den Azure-Call nicht aufblähen
// kann. Geteilt von Chat- und Eskalations-Route.
export const MAX_MESSAGES = 24;
export const MAX_MESSAGE_CHARS = 4_000;
export const MAX_TOTAL_CHARS = 24_000;

export type ValidationResult =
  | { ok: true; messages: SupportMessage[] }
  | { ok: false; error: string };

/**
 * Validiert `{ messages: [{ role, content }] }` aus dem Request-Body zu einer
 * sauberen `SupportMessage[]`. Akzeptiert nur die Rollen `user`/`assistant`.
 */
export function parseSupportMessages(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body muss ein JSON-Objekt sein" };
  }
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "messages muss eine nicht-leere Liste sein" };
  }
  if (raw.length > MAX_MESSAGES) {
    return { ok: false, error: `Zu viele Nachrichten (max ${MAX_MESSAGES})` };
  }

  const messages: SupportMessage[] = [];
  let total = 0;
  for (const m of raw) {
    if (!m || typeof m !== "object") {
      return { ok: false, error: "Ungültige Nachricht" };
    }
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") {
      return { ok: false, error: "role muss user oder assistant sein" };
    }
    if (typeof content !== "string" || content.trim().length === 0) {
      return { ok: false, error: "content muss ein nicht-leerer String sein" };
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return {
        ok: false,
        error: `Nachricht zu lang (max ${MAX_MESSAGE_CHARS} Zeichen)`,
      };
    }
    total += content.length;
    messages.push({ role, content });
  }
  if (total > MAX_TOTAL_CHARS) {
    return { ok: false, error: "Gesprächsverlauf zu lang" };
  }
  // Die letzte Nachricht muss vom User kommen — sonst gibt es nichts zu
  // beantworten.
  if (messages[messages.length - 1]!.role !== "user") {
    return { ok: false, error: "Letzte Nachricht muss vom User sein" };
  }
  return { ok: true, messages };
}

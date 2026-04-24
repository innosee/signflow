import "server-only";

import { headers } from "next/headers";

/**
 * Bot-Protection-Stack für öffentliche Formulare (aktuell: Warteliste).
 *
 * Drei voneinander unabhängige Schichten — jede für sich tötet den naiven
 * Spam, kombiniert auch geschicktere Bots:
 *
 *   1. Honeypot-Feld — versteckt im DOM, von echten Usern nicht ausfüllbar.
 *      Wenn gesetzt → Bot, sofort verwerfen.
 *   2. Min-Time-to-Submit — Browser setzt beim Mount einen Timestamp ins
 *      Formular. Submission unter `MIN_FILL_MS` (oder ohne Timestamp) →
 *      Bot. Real-User braucht zum Tippen immer >2 Sekunden.
 *   3. Cloudflare Turnstile — managed Captcha (meist invisible), serverseitig
 *      gegen siteverify validiert. Optional: nur aktiv wenn
 *      `TURNSTILE_SECRET_KEY` (server) und `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
 *      (client) gesetzt sind. Ohne Keys läuft Layer 1+2 weiter.
 *
 * Zusätzlich: pro IP simpler in-memory Rate-Limit. Auf Vercel ist das nicht
 * cluster-koordiniert (mehrere Lambda-Instanzen sehen ihre eigene Map),
 * aber besser als nichts und ohne Redis-Abhängigkeit. Better Auths
 * eingebauter Rate-Limit für /sign-in arbeitet nach demselben Muster.
 */

export const HONEYPOT_FIELD = "website";
export const TIMESTAMP_FIELD = "rendered_at";
export const TURNSTILE_FIELD = "cf-turnstile-response";

const MIN_FILL_MS = 2_500;
const MAX_TIMESTAMP_AGE_MS = 60 * 60 * 1000; // 1h

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1h
const RATE_LIMIT_MAX = 5;

type Bucket = { count: number; resetAt: number };
const ipBuckets = new Map<string, Bucket>();

export type BotCheckResult =
  | { ok: true }
  | { ok: false; reason: string; userMessage: string };

/**
 * Liest die Client-IP aus den Forwarded-Headern. Auf Vercel ist die erste
 * IP in `x-forwarded-for` der echte Client; weitere Einträge sind Proxies.
 */
async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const existing = ipBuckets.get(ip);

  if (!existing || existing.resetAt <= now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    if (ipBuckets.size > 10_000) pruneBuckets(now);
    return true;
  }

  if (existing.count >= RATE_LIMIT_MAX) return false;
  existing.count += 1;
  return true;
}

function pruneBuckets(now: number): void {
  for (const [ip, bucket] of ipBuckets) {
    if (bucket.resetAt <= now) ipBuckets.delete(ip);
  }
}

async function verifyTurnstile(
  token: string,
  ip: string,
): Promise<{ ok: boolean; errorCodes?: string[] }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true };

  if (!token) return { ok: false, errorCodes: ["missing-input-response"] };

  const body = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body, signal: AbortSignal.timeout(5_000) },
    );
    const data = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    return { ok: data.success, errorCodes: data["error-codes"] };
  } catch (err) {
    console.warn("turnstile verify failed:", err);
    // Cloudflare-Ausfall → wir wollen keine echten User abweisen, solange
    // Honeypot+Time-Check schon greifen. Fail-open ist hier akzeptabel.
    return { ok: true };
  }
}

/**
 * Validiert ein public-form Submission gegen alle drei Bot-Layer + Rate-Limit.
 * Aufruf vor jeder DB-/Mail-Operation.
 */
export async function runBotChecks(formData: FormData): Promise<BotCheckResult> {
  const honeypot = String(formData.get(HONEYPOT_FIELD) ?? "").trim();
  if (honeypot) {
    return {
      ok: false,
      reason: `honeypot filled: ${honeypot.slice(0, 40)}`,
      userMessage: "Anfrage wurde abgelehnt.",
    };
  }

  const renderedAtRaw = String(formData.get(TIMESTAMP_FIELD) ?? "").trim();
  const renderedAt = Number(renderedAtRaw);
  const now = Date.now();
  if (!renderedAtRaw || !Number.isFinite(renderedAt)) {
    return {
      ok: false,
      reason: "missing or invalid render timestamp",
      userMessage: "Bitte aktiviere JavaScript und lade die Seite neu.",
    };
  }
  const age = now - renderedAt;
  if (age < MIN_FILL_MS) {
    return {
      ok: false,
      reason: `submitted too fast (${age}ms)`,
      userMessage: "Anfrage wurde abgelehnt.",
    };
  }
  if (age > MAX_TIMESTAMP_AGE_MS) {
    return {
      ok: false,
      reason: `stale timestamp (${age}ms old)`,
      userMessage: "Formular ist abgelaufen — bitte Seite neu laden.",
    };
  }

  const ip = await getClientIp();

  if (!checkRateLimit(ip)) {
    return {
      ok: false,
      reason: `rate limit exceeded for ${ip}`,
      userMessage:
        "Zu viele Anfragen von dieser Verbindung. Bitte später erneut versuchen.",
    };
  }

  const turnstileToken = String(formData.get(TURNSTILE_FIELD) ?? "").trim();
  const turnstile = await verifyTurnstile(turnstileToken, ip);
  if (!turnstile.ok) {
    return {
      ok: false,
      reason: `turnstile failed: ${(turnstile.errorCodes ?? []).join(",")}`,
      userMessage:
        "Sicherheitsprüfung fehlgeschlagen. Bitte Seite neu laden und erneut versuchen.",
    };
  }

  return { ok: true };
}

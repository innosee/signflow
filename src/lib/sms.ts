import "server-only";

/**
 * SMS-Layer für Magic-Link-Zustellung an Teilnehmer ohne Email-Affinität.
 *
 * **Provider:** seven.io (sms77, Sieben Communications GmbH, Köln). Wahl
 * begründet durch DE-Sitz + DSGVO-konforme Hosting-Lage, einfache HTTP-API
 * (ein POST-Endpoint), Per-SMS-Pricing ohne Monatsmindestumsatz und
 * Standard-AVV. Twilio/Bird/Vonage tun's technisch genauso, aber die
 * deutsche GmbH ist die saubere Default-Wahl für ein DE-only-Produkt.
 *
 * **Modi:**
 *  - `mock` (default) → loggt in die Konsole, kostet nichts, perfekt für
 *    Dev/Preview/Staging. In Production hart blockiert (siehe sendSms()),
 *    sonst gehen Magic-Links verloren ohne dass jemand es merkt.
 *  - `live` → POST an seven.io.
 *
 * **Provider-Wechsel:** Interface ist absichtlich minimal (`{to, body}` →
 * void). Ein Switch auf Twilio/Bird wäre ein neues `sendViaXxx()` plus
 * ein anderer Branch in `sendSms()`. Keine Aufrufer-Änderung nötig.
 */

export type SendSmsInput = {
  /** Empfängernummer im E.164-Format, z.B. `+4915712345678`. */
  to: string;
  /** Klartext der SMS. Sollte unter 160 Zeichen bleiben (siehe composeMagicLinkSms). */
  body: string;
};

function isMockMode(): boolean {
  return process.env.SMS_MODE !== "live";
}

/**
 * Globaler Feature-Gate für den SMS-Channel. Solange `false`, ist SMS
 * in der Coach-UI komplett unsichtbar (Channel-Selector, Phone-Feld,
 * SMS-Badge ausgeblendet) UND der Backend-Layer erzwingt Email-Channel
 * unabhängig vom Caller-Wunsch (Defense-in-Depth gegen z.B. veraltete
 * Browser-Tabs nach Flag-Off).
 *
 * Hintergrund: Schema-Migration + Code gehen live, BEVOR seven.io-Account
 * + AVV + Datenschutz-Update fertig sind. Dark-Launch-Pattern (analog zu
 * `signing_enabled` per User) sorgt dafür, dass das Feature in Production
 * nichts tut, bis wir es bewusst flippen.
 *
 * Pendant-Env: `SMS_ENABLED=true` (server-only — Client erfährt den Wert
 * über props aus dem Server-RSC, kein NEXT_PUBLIC_-Leak).
 */
export function isSmsEnabled(): boolean {
  return process.env.SMS_ENABLED === "true";
}

/**
 * Der seven.io-Account erlaubt einen freien Absender-String (Alphanumeric
 * Sender ID). DE-MNOs erlauben max. 11 ASCII-Zeichen. Default „Signflow"
 * ist 8 Zeichen → safe. Nicht alle Zielländer akzeptieren Alpha-Sender;
 * für DE-only-Volumen reicht's.
 */
function senderId(): string {
  return process.env.SMS_FROM ?? "Signflow";
}

async function sendViaSevenIo(input: SendSmsInput): Promise<void> {
  const apiKey = process.env.SMS77_API_KEY;
  if (!apiKey) throw new Error("SMS77_API_KEY not set");

  // seven.io API-Doku: POST application/x-www-form-urlencoded an
  // https://gateway.seven.io/api/sms mit X-Api-Key-Header.
  // `json=1` zwingt JSON-Antwort statt Plain-Text-Code, damit Parsing
  // robust bleibt.
  const params = new URLSearchParams({
    to: input.to,
    text: input.body,
    from: senderId(),
    json: "1",
  });

  const res = await fetch("https://gateway.seven.io/api/sms", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Api-Key": apiKey,
      Accept: "application/json",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`seven.io HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json().catch(() => null)) as {
    success?: string;
    messages?: Array<{ success?: boolean; error?: string | null }>;
  } | null;

  // seven.io: `success: "100"` heißt OK. Alles andere ist eine Fehler-
  // Code (z.B. "201" = ungültige Empfängernummer). Zusätzlich pro Message
  // ein `success: true|false` mit `error`-Detail.
  const overallOk = data?.success === "100";
  const messageOk = data?.messages?.every((m) => m.success !== false) ?? true;
  if (!overallOk || !messageOk) {
    const detail = data?.messages?.find((m) => m.error)?.error ?? data?.success;
    throw new Error(`seven.io send failed: ${detail ?? "unknown"}`);
  }
}

function logToConsole(input: SendSmsInput): void {
  console.log(
    [
      "",
      "╭─ 📱 SMS (mock, set SMS_MODE=live + SMS77_API_KEY for real send) ─",
      `│ To:   ${input.to}`,
      `│ From: ${senderId()}`,
      "├─ Body ───────────────────────────────────────────────────────────",
      input.body,
      "╰──────────────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  );
}

export async function sendSms(input: SendSmsInput): Promise<void> {
  if (!isMockMode()) {
    await sendViaSevenIo(input);
    return;
  }

  // Spiegelbild der email.ts-Logik: in Production darf SMS nicht stillschweigend
  // mocken — sonst geht ein Magic-Link verloren ohne dass jemand es merkt.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SMS_MODE must be 'live' in production — refusing to mock magic-link delivery.",
    );
  }

  logToConsole(input);
}

/**
 * Strikte E.164-Validierung. Akzeptiert führendes `+` plus 8–15 Ziffern,
 * keine Leerzeichen/Klammern/Bindestriche. Wir verlassen uns auf Coach-
 * UI-Normalisierung (siehe `normalizePhoneInput()`), die freundlichere
 * Eingaben in das Soll-Format überführt.
 */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

/**
 * Best-effort-Normalisierung von Coach-Eingaben:
 *  - „0157 12345678"      → `+4915712345678` (DE-Default für nationale Nummern)
 *  - „+49 157 1234-5678"  → `+4915712345678`
 *  - „004915712345678"    → `+4915712345678`
 *  - „15712345678"        → unklar → unverändert (Coach muss korrigieren)
 *
 * Bewusst konservativ: nur DE als implizite Annahme, keine Ländererkennung
 * über Heuristiken — sonst landen TN-Nummern aus AT/CH bei der falschen
 * Vorwahl. Für nicht-DE einfach mit `+` voranstellen lassen.
 */
export function normalizePhoneInput(raw: string): string {
  const cleaned = raw.replace(/[\s\-()/]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`;
  if (cleaned.startsWith("0") && cleaned.length >= 10) {
    return `+49${cleaned.slice(1)}`;
  }
  return cleaned;
}

/**
 * Komponiert die Magic-Link-SMS so, dass sie idR in 1 Segment (160 GSM-7-
 * Zeichen) bleibt. Längere Kurstitel werden wenn nötig vom Backend
 * gekürzt. Der Link ist das wichtigste Element und steht zuerst nach der
 * Anrede, damit er auch bei verschluckten Anhängen sichtbar bleibt.
 */
export function composeMagicLinkSms(params: {
  participantName: string;
  courseTitle: string;
  url: string;
}): string {
  const greeting = greetingForFirstName(params.participantName);
  return `${greeting}bitte bestätige deine Anwesenheit für „${params.courseTitle}": ${params.url} (24h gültig).`;
}

/**
 * Preview-SMS-Variant: anderer Wortlaut als der Magic-Link, weil der TN
 * jetzt nicht mehr Sessions bestätigt, sondern das fertige Dokument als
 * Ganzes freigibt. Lebt zentral hier (statt inline im Caller), damit
 * Magic-Link- und Preview-SMS denselben Stil + dieselben Constraints
 * (1 Segment, Link früh, 24h-Hinweis) teilen.
 */
export function composePreviewSms(params: {
  participantName: string;
  courseTitle: string;
  url: string;
}): string {
  const greeting = greetingForFirstName(params.participantName);
  return `${greeting}dein Stundennachweis für „${params.courseTitle}“ ist fertig — bitte ansehen und freigeben: ${params.url} (24h gültig).`;
}

// Vorname only, damit Anrede + Link in 1 Segment passen.
function greetingForFirstName(fullName: string): string {
  const firstName = fullName.split(" ")[0] ?? "";
  return firstName ? `Hallo ${firstName}, ` : "";
}

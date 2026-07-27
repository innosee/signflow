import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { sendDeliveryFailureAlert } from "@/lib/email";

export const runtime = "nodejs";

/**
 * Resend-Webhook: meldet Zustell-Probleme, die NACH der Annahme durch Resend
 * auftreten (Bounce, Spam-Beschwerde, verzögerte Zustellung). Genau diese
 * Fälle — z.B. Yahoo verwirft still — erzeugen im Sende-Code keinen Fehler und
 * blieben bisher unsichtbar. Hier wird pro relevantem Event eine Alert-Mail an
 * den Betreiber geschickt.
 *
 * Absicherung quick & dirty: geteiltes Secret im Query-Param `?secret=…`
 * (in Resend in die Webhook-URL eintragen). Reicht für einen reinen
 * Alerting-Endpoint ohne DB-Writes. Upgrade-Pfad: Svix-Signaturprüfung der
 * `svix-*`-Header (Resend signiert ohnehin) statt URL-Secret.
 */

// Nur diese Event-Typen lösen einen Alert aus. Erfolgs-Events
// (email.sent/delivered/opened/clicked) werden bewusst ignoriert.
const ALERT_EVENTS: Record<string, string> = {
  "email.bounced": "Bounce",
  "email.complained": "Spam-Beschwerde",
  "email.delivery_delayed": "Zustellung verzögert",
  "email.failed": "Versand fehlgeschlagen",
};

function secretOk(req: Request): boolean {
  const expected = process.env.RESEND_WEBHOOK_SECRET;
  if (!expected) return false; // nicht konfiguriert → hart ablehnen
  const got = new URL(req.url).searchParams.get("secret") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  // timingSafeEqual wirft bei ungleicher Länge — Längen-Check vorschalten.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** to kann String oder String[] sein — defensiv zu einem String machen. */
function joinRecipients(to: unknown): string {
  if (Array.isArray(to)) return to.filter(Boolean).map(String).join(", ");
  if (typeof to === "string") return to;
  return "(unbekannt)";
}

/** Bounce-/Fehler-Detail best-effort aus dem Event ziehen. */
function extractDetail(data: Record<string, unknown>): string | undefined {
  const bounce = data.bounce as Record<string, unknown> | undefined;
  const candidate =
    (bounce && (bounce.message ?? bounce.subType ?? bounce.type)) ??
    data.reason ??
    (data.complaint as Record<string, unknown> | undefined)?.type;
  if (candidate == null) return undefined;
  return String(candidate).slice(0, 500);
}

export async function POST(req: Request) {
  if (!secretOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let event: { type?: string; created_at?: string; data?: Record<string, unknown> };
  try {
    event = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const type = event.type ?? "";
  const label = ALERT_EVENTS[type];
  // Kein Alert-relevantes Event → 200, damit Resend nicht retryt.
  if (!label) {
    return NextResponse.json({ ignored: type || "unknown" });
  }

  const data = event.data ?? {};
  try {
    await sendDeliveryFailureAlert({
      eventLabel: label,
      eventType: type,
      recipient: joinRecipients(data.to),
      originalSubject:
        typeof data.subject === "string" ? data.subject : undefined,
      detail: extractDetail(data),
      emailId:
        typeof data.email_id === "string" ? data.email_id : undefined,
      occurredAt: event.created_at ?? new Date().toISOString(),
    });
  } catch (err) {
    // Alert-Mail selbst fehlgeschlagen: loggen, aber 200 zurückgeben, damit
    // Resend keinen Retry-Sturm auslöst. Der Fall steht dann im Vercel-Log.
    console.error("Resend-Webhook: Alert-Versand fehlgeschlagen:", err);
    return NextResponse.json({ alerted: false });
  }

  return NextResponse.json({ alerted: true });
}

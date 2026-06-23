import "server-only";

import { sendEmail } from "@/lib/email";

import type { SupportMessage } from "./azure-chat";

export type EscalationPayload = {
  coachName: string;
  coachEmail: string;
  tenantId: string;
  messages: SupportMessage[];
  /** Optionale Zusatznotiz, die der Coach beim Klick auf „Mensch kontaktieren" mitschickt. */
  note?: string;
  occurredAt: Date;
};

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch]!);
}

function roleLabel(role: SupportMessage["role"]): string {
  return role === "user" ? "Coach" : "Assistent";
}

function transcriptText(messages: SupportMessage[]): string {
  return messages.map((m) => `${roleLabel(m.role)}: ${m.content}`).join("\n\n");
}

function transcriptHtml(messages: SupportMessage[]): string {
  return messages
    .map(
      (m) =>
        `<p style="margin:0 0 12px 0;"><strong>${esc(roleLabel(m.role))}:</strong><br/>${esc(
          m.content,
        ).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
}

async function sendEscalationEmail(p: EscalationPayload): Promise<void> {
  const to = process.env.SUPPORT_ESCALATION_EMAIL ?? "info@innosee.de";
  const when = p.occurredAt.toLocaleString("de-DE");
  const note = p.note?.trim();

  const html = `<!doctype html>
<html lang="de">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f5f5f5; padding:24px; color:#111;">
    <div style="max-width:640px; margin:0 auto; background:#fff; padding:32px; border-radius:12px;">
      <h1 style="margin:0 0 8px 0; font-size:20px;">Support-Anfrage aus dem Coach-Chat</h1>
      <p style="margin:0 0 16px 0; color:#555; font-size:14px;">
        <strong>${esc(p.coachName)}</strong> (${esc(p.coachEmail)}) bittet um menschliche Unterstützung.<br/>
        Tenant: ${esc(p.tenantId)} · ${esc(when)}
      </p>
      ${
        note
          ? `<blockquote style="margin:0 0 20px 0; padding:12px 16px; border-left:3px solid #d4d4d8; background:#fafafa; color:#333; white-space:pre-wrap;">${esc(
              note,
            )}</blockquote>`
          : ""
      }
      <hr style="border:none; border-top:1px solid #eee; margin:20px 0;" />
      <h2 style="font-size:14px; margin:0 0 12px 0;">Gesprächsverlauf</h2>
      ${transcriptHtml(p.messages)}
      <hr style="border:none; border-top:1px solid #eee; margin:24px 0;" />
      <p style="color:#888; font-size:12px;">Signflow — Coach-Support</p>
    </div>
  </body>
</html>`;

  const text = [
    `Support-Anfrage aus dem Coach-Chat`,
    `${p.coachName} (${p.coachEmail}) bittet um menschliche Unterstützung.`,
    `Tenant: ${p.tenantId} · ${when}`,
    note ? `\nNotiz: ${note}` : "",
    `\n--- Gesprächsverlauf ---\n`,
    transcriptText(p.messages),
  ].join("\n");

  await sendEmail({
    to,
    // Plaintext-Feld → kein HTML-Escaping (sonst Entities im Betreff sichtbar).
    subject: `Support-Anfrage: ${p.coachName}`,
    html,
    text,
  });
}

/**
 * Postet an einen Chat-Webhook (Slack ODER Microsoft Teams). Kanal über
 * SUPPORT_WEBHOOK_KIND gesteuert (default „slack"). Beide erwarten einen POST
 * mit JSON, nur das Payload-Format unterscheidet sich. Best-effort: Fehler
 * werden geloggt, nicht geworfen.
 */
async function postWebhook(p: EscalationPayload): Promise<void> {
  const url = process.env.SUPPORT_WEBHOOK_URL;
  if (!url) return;

  const kind = (process.env.SUPPORT_WEBHOOK_KIND ?? "slack").toLowerCase();
  const when = p.occurredAt.toLocaleString("de-DE");
  const note = p.note?.trim();
  const lastUserMsg =
    [...p.messages].reverse().find((m) => m.role === "user")?.content ?? "";

  const summary = [
    `🆘 *Support-Anfrage* von ${p.coachName} (${p.coachEmail})`,
    `Tenant: ${p.tenantId} · ${when}`,
    note ? `Notiz: ${note}` : "",
    `Letzte Frage: ${lastUserMsg}`,
  ]
    .filter(Boolean)
    .join("\n");

  const payload =
    kind === "teams"
      ? {
          "@type": "MessageCard",
          "@context": "https://schema.org/extensions",
          summary: `Support-Anfrage von ${p.coachName}`,
          themeColor: "0F62FE",
          title: "Support-Anfrage aus dem Coach-Chat",
          text: summary.replace(/\n/g, "  \n"),
        }
      : { text: summary };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(
        `Support-Webhook (${kind}) antwortete mit Status ${res.status}`,
      );
    }
  } catch (err) {
    console.error("Support-Webhook fehlgeschlagen:", err);
  }
}

/**
 * Verschickt die Eskalation an Mensch-Kanäle: Resend-Mail (verlässlicher
 * Anker) + optionaler Slack/Teams-Webhook. Die Mail ist der harte Fehlerpfad —
 * schlägt sie fehl, wirft die Funktion; der Webhook ist best-effort.
 */
export async function notifySupportEscalation(
  payload: EscalationPayload,
): Promise<void> {
  const [emailResult] = await Promise.allSettled([
    sendEscalationEmail(payload),
    postWebhook(payload),
  ]);
  if (emailResult.status === "rejected") {
    throw emailResult.reason instanceof Error
      ? emailResult.reason
      : new Error(String(emailResult.reason));
  }
}

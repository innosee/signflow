"use server";

import { sendEmail } from "@/lib/email";

export type WaitlistState =
  | { ok?: true; error?: never }
  | { ok?: never; error: string }
  | undefined;

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

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * Leitet einen Warteliste-Eintrag per E-Mail an info@innosee.de weiter.
 * Kein DB-Schema für Waitlist (vorerst) — bis die Agency-Self-Signup-
 * Phase kommt, reicht ein simpler Inbox-Drop; danach können wir das
 * Formular direkt in die Agency-Anlage mit E-Mail-Verifikation
 * umwandeln.
 */
export async function submitWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const company = String(formData.get("company") ?? "").trim();
  const coachesRaw = String(formData.get("coaches") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name || !email || !company) {
    return { error: "Name, E-Mail und Firma sind Pflichtfelder." };
  }
  if (!looksLikeEmail(email)) {
    return { error: "Ungültiges E-Mail-Format." };
  }
  if (name.length > 120 || company.length > 200 || message.length > 2000) {
    return { error: "Bitte Eingaben kürzen." };
  }

  const inbox = process.env.WAITLIST_INBOX ?? "info@innosee.de";

  try {
    await sendEmail({
      to: inbox,
      subject: `Signflow Warteliste: ${company}`,
      html: `
        <h2 style="margin:0 0 12px 0;">Neue Warteliste-Anfrage</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
          <tr><td style="padding:4px 12px 4px 0;color:#555;">Name</td><td>${esc(name)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555;">E-Mail</td><td>${esc(email)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555;">Firma</td><td>${esc(company)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555;">Coaches</td><td>${esc(coachesRaw || "—")}</td></tr>
        </table>
        ${
          message
            ? `<p style="margin-top:16px;"><strong>Nachricht:</strong><br/>${esc(message).replace(/\n/g, "<br/>")}</p>`
            : ""
        }
      `,
      text: `Signflow Warteliste\n\nName: ${name}\nE-Mail: ${email}\nFirma: ${company}\nCoaches: ${coachesRaw || "—"}\n\n${message}`,
    });
  } catch (err) {
    console.error("waitlist submission failed:", err);
    return {
      error:
        "Konnte nicht zugestellt werden. Bitte später erneut versuchen oder an info@innosee.de schreiben.",
    };
  }

  return { ok: true };
}

import "server-only";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

const fromAddress =
  process.env.EMAIL_FROM ?? "Signflow <onboarding@resend.dev>";

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

/**
 * URLs nur durchlassen, wenn sie http/https sind — verhindert, dass
 * z.B. `javascript:` als Magic-Link eingeschleust wird.
 */
function safeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("unsafe url protocol");
    }
    return u.toString();
  } catch {
    throw new Error(`Invalid or unsafe URL: ${raw}`);
  }
}

async function sendViaResend(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message ?? String(error)}`);
  }
}

function logToConsole(input: SendEmailInput): void {
  console.log(
    [
      "",
      "╭─ 📧 Email (dev, no RESEND_API_KEY set) ─────────────────",
      `│ To:      ${input.to}`,
      `│ From:    ${fromAddress}`,
      `│ Subject: ${input.subject}`,
      "├─ HTML ───────────────────────────────────────────────────",
      input.html,
      "╰──────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  );
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    await sendViaResend(input);
    return;
  }

  // In Production würde der Console-Fallback Magic-Links & Reset-Tokens
  // in die Logs schreiben — nicht akzeptabel. Hart werfen, damit niemand
  // ohne Resend deployed.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "RESEND_API_KEY must be set in production — refusing to log reset/invite tokens.",
    );
  }

  logToConsole(input);
}

function renderLayout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="de">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f5f5f5; padding:24px; color:#111;">
    <div style="max-width:560px; margin:0 auto; background:#fff; padding:32px; border-radius:12px;">
      <h1 style="margin:0 0 16px 0; font-size:20px;">${esc(title)}</h1>
      ${bodyHtml}
      <hr style="border:none; border-top:1px solid #eee; margin:32px 0;" />
      <p style="color:#888; font-size:12px;">Signflow — digitale Anwesenheitsnachweise</p>
    </div>
  </body>
</html>`;
}

function renderButton(url: string, label: string): string {
  const safe = safeUrl(url);
  return `<p style="margin:24px 0;">
    <a href="${esc(safe)}" style="display:inline-block; background:#111; color:#fff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:500;">${esc(label)}</a>
  </p>
  <p style="font-size:12px; color:#888; word-break:break-all;">Oder diesen Link öffnen: <br />${esc(safe)}</p>`;
}

export async function sendInviteEmail(params: {
  to: string;
  name: string;
  url: string;
}): Promise<void> {
  const body = `
    <p>Hallo ${esc(params.name)},</p>
    <p>du wurdest als Coach zu Signflow eingeladen. Klick den Button unten, um dein Passwort festzulegen und loszulegen.</p>
    ${renderButton(params.url, "Passwort festlegen")}
    <p style="font-size:12px; color:#888;">Der Link ist zeitlich begrenzt gültig. Falls er abgelaufen ist, kontaktiere deine Agentur für eine neue Einladung.</p>
  `;
  await sendEmail({
    to: params.to,
    subject: "Willkommen bei Signflow – Passwort festlegen",
    html: renderLayout("Willkommen bei Signflow", body),
  });
}

export async function sendResetPasswordEmail(params: {
  to: string;
  name: string;
  url: string;
}): Promise<void> {
  // Gleiche Vorlage für Invite (direkt nach createUser) und späteren Reset —
  // inhaltlich für den User nicht sinnvoll unterscheidbar im MVP.
  await sendInviteEmail(params);
}

export async function sendParticipantMagicLink(params: {
  to: string;
  participantName: string;
  courseTitle: string;
  sessionDate: string;
  url: string;
}): Promise<void> {
  const body = `
    <p>Hallo ${esc(params.participantName)},</p>
    <p>Bitte bestätige deine Anwesenheit für die Einheit am <strong>${esc(params.sessionDate)}</strong> im Kurs <strong>${esc(params.courseTitle)}</strong>.</p>
    ${renderButton(params.url, "Jetzt bestätigen")}
    <p style="font-size:12px; color:#888;">Der Link ist 24 Stunden gültig und kann nur einmal verwendet werden.</p>
  `;
  await sendEmail({
    to: params.to,
    subject: `Anwesenheit bestätigen – ${params.courseTitle}`,
    html: renderLayout("Anwesenheit bestätigen", body),
  });
}

/**
 * Preview-Mail: alle Sessions sind vom Coach+TN signiert, Coach möchte jetzt
 * die finale Freigabe einholen. URL führt auf dieselbe Sign-Page wie der
 * normale Magic-Link — die Page entscheidet anhand des Signatur-Stands
 * automatisch, dass der Preview-Modus angezeigt wird (pixel-identisch zum
 * späteren PDF inkl. Freigabe-Button).
 */
export async function sendParticipantPreview(params: {
  to: string;
  participantName: string;
  courseTitle: string;
  url: string;
}): Promise<void> {
  const body = `
    <p>Hallo ${esc(params.participantName)},</p>
    <p>Dein Kurs <strong>${esc(params.courseTitle)}</strong> ist abgeschlossen. Bitte sieh dir den fertigen Stundennachweis einmal an und gib ihn für die Übermittlung an die Agentur für Arbeit frei.</p>
    ${renderButton(params.url, "Nachweis ansehen & freigeben")}
    <p style="font-size:12px; color:#888;">Der Link ist 24 Stunden gültig. Die Freigabe ist kein rechtliches Siegel — das setzt im Anschluss dein Coach.</p>
  `;
  await sendEmail({
    to: params.to,
    // Subject ist plaintext-Feld → KEIN HTML-Escaping, sonst würden
    // Entity-Sequenzen wie `&amp;` im Inbox-Betreff sichtbar. Escaping
    // bleibt auf dem HTML-Body.
    subject: `Nachweis freigeben – ${params.courseTitle}`,
    html: renderLayout("Stundennachweis zur Freigabe", body),
  });
}

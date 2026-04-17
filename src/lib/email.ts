import "server-only";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

const fromAddress =
  process.env.EMAIL_FROM ?? "Signflow <onboarding@resend.dev>";

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
  } else {
    logToConsole(input);
  }
}

function renderLayout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="de">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f5f5f5; padding:24px; color:#111;">
    <div style="max-width:560px; margin:0 auto; background:#fff; padding:32px; border-radius:12px;">
      <h1 style="margin:0 0 16px 0; font-size:20px;">${title}</h1>
      ${bodyHtml}
      <hr style="border:none; border-top:1px solid #eee; margin:32px 0;" />
      <p style="color:#888; font-size:12px;">Signflow — digitale Anwesenheitsnachweise</p>
    </div>
  </body>
</html>`;
}

function renderButton(url: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${url}" style="display:inline-block; background:#111; color:#fff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:500;">${label}</a>
  </p>
  <p style="font-size:12px; color:#888; word-break:break-all;">Oder diesen Link öffnen: <br />${url}</p>`;
}

export async function sendInviteEmail(params: {
  to: string;
  name: string;
  url: string;
}): Promise<void> {
  const body = `
    <p>Hallo ${params.name},</p>
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
  // Same template covers both initial invite (triggered right after createUser)
  // and later password resets; user cannot distinguish meaningfully for MVP.
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
    <p>Hallo ${params.participantName},</p>
    <p>Bitte bestätige deine Anwesenheit für die Einheit am <strong>${params.sessionDate}</strong> im Kurs <strong>${params.courseTitle}</strong>.</p>
    ${renderButton(params.url, "Jetzt bestätigen")}
    <p style="font-size:12px; color:#888;">Der Link ist 24 Stunden gültig und kann nur einmal verwendet werden.</p>
  `;
  await sendEmail({
    to: params.to,
    subject: `Anwesenheit bestätigen – ${params.courseTitle}`,
    html: renderLayout("Anwesenheit bestätigen", body),
  });
}

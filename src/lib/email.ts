import "server-only";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

// Garantiert in Resend verifizierter Absender — signflow.coach ist die
// verifizierte Sending-Domain. Dient als Default UND als Notfall-Fallback,
// falls `EMAIL_FROM` auf eine NICHT verifizierte Domain zeigt (siehe unten).
const VERIFIED_FALLBACK_FROM = "Signflow <noreply@signflow.coach>";

// Absender. Default ist der verifizierte Signflow-Absender, damit Mails auch
// dann zugestellt werden, wenn `EMAIL_FROM` nicht (oder leer) gesetzt ist.
// WICHTIG: `||` statt `??`, damit ein LEERER String (`""`, kommt bei Vercel-
// Env-Overrides vor) ebenfalls auf den Default fällt — sonst ginge `from: ""`
// an Resend → 422 „The domain is invalid" und KEINE Mail käme an.
const fromAddress = process.env.EMAIL_FROM?.trim() || VERIFIED_FALLBACK_FROM;

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

  const payload = {
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  };

  const { error } = await resend.emails.send({ from: fromAddress, ...payload });
  if (!error) return;

  // Häufigste Prod-Fehlkonfiguration: `EMAIL_FROM` zeigt auf eine Domain, die
  // in Resend NICHT verifiziert ist (z.B. eine erango.de-Adresse) → Resend
  // lehnt mit „domain is not verified" ab und ALLE Mails fallen aus. Damit ein
  // falsch gesetztes `EMAIL_FROM` nicht die gesamte Zustellung lahmlegt: einmal
  // mit dem garantiert verifizierten Default-Absender neu versuchen. Der Betrieb
  // sollte `EMAIL_FROM` trotzdem korrigieren (die Warnung landet im Log).
  const message = error.message ?? String(error);
  const domainNotVerified =
    /not verified|domain is invalid|verify your domain/i.test(message);
  if (domainNotVerified && fromAddress !== VERIFIED_FALLBACK_FROM) {
    console.warn(
      `[email] EMAIL_FROM "${fromAddress}" wird von Resend abgelehnt (${message}). ` +
        `Fallback-Versand über ${VERIFIED_FALLBACK_FROM}. Bitte EMAIL_FROM in der ` +
        `Prod-Umgebung auf eine verifizierte Domain (signflow.coach) setzen oder die ` +
        `gewünschte Domain in Resend verifizieren.`,
    );
    const { error: retryError } = await resend.emails.send({
      from: VERIFIED_FALLBACK_FROM,
      ...payload,
    });
    if (!retryError) return;
    throw new Error(
      `Resend error (auch nach Fallback-Absender): ${
        retryError.message ?? String(retryError)
      }`,
    );
  }

  throw new Error(`Resend error: ${message}`);
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
    <p style="font-size:12px; color:#888;">Der Link ist zeitlich begrenzt gültig. Falls er abgelaufen ist, kontaktiere deinen Bildungsträger für eine neue Einladung.</p>
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

/**
 * Mail an einen BEREITS bestehenden Nutzer, der als Coach zu einem weiteren
 * Bildungsträger EINGELADEN wurde (Membership-Modell). Die Einladung ist offen
 * und muss aktiv angenommen werden — der Link führt zur Einladungs-Übersicht,
 * nicht direkt in den Träger. Kein Passwort-Reset (die Person hat schon ein
 * Konto).
 */
export async function sendCoachInvitationToAccept(params: {
  to: string;
  name: string;
  tenantName: string;
  url: string;
}): Promise<void> {
  const body = `
    <p>Hallo ${esc(params.name)},</p>
    <p>du wurdest als <strong>Coach</strong> zu <strong>${esc(params.tenantName)}</strong> eingeladen. Melde dich mit deinem bestehenden Signflow-Konto an und nimm die Einladung an — danach kannst du oben im Menü zwischen deinen Bildungsträgern wechseln.</p>
    ${renderButton(params.url, "Einladung ansehen")}
  `;
  await sendEmail({
    to: params.to,
    subject: `Einladung als Coach – ${params.tenantName}`,
    html: renderLayout("Einladung als Coach", body),
  });
}

/**
 * Mail an den Coach: der Bildungsträger hat ihm einen (neuen) Kunden zugewiesen.
 * Wird beim Anlegen eines Kunden an alle zugewiesenen Coaches geschickt und beim
 * Bearbeiten an neu ins Kompetenzteam aufgenommene Coaches. Führt direkt auf die
 * Kunden-Ansicht, wo der Coach die Termine erfasst.
 */
export async function sendCourseAssignedToCoach(params: {
  to: string;
  coachName: string;
  customerName: string;
  courseTitle: string;
  url: string;
}): Promise<void> {
  const body = `
    <p>Hallo ${esc(params.coachName)},</p>
    <p>dir wurde ein neuer Kunde zugewiesen: <strong>${esc(params.customerName)}</strong> (${esc(params.courseTitle)}). Du kannst jetzt die Termine erfassen und unterschreiben.</p>
    ${renderButton(params.url, "Kunde öffnen")}
  `;
  await sendEmail({
    to: params.to,
    // Plaintext-Betreff → kein HTML-Escaping (sonst Entities sichtbar).
    subject: `Neuer Kunde zugewiesen – ${params.customerName}`,
    html: renderLayout("Neuer Kunde zugewiesen", body),
  });
}

/**
 * Der BT hat die E-Mail-Adresse eines Kunden korrigiert → die bisher
 * verschickten Magic-Links zeigten auf die ALTE Adresse und sind jetzt
 * revoked. Der Coach muss den Teilnehmer aktiv erneut einladen, sonst bleibt
 * der Nachweis im „wartet auf TN"-Limbo (TN bekam nie einen funktionierenden
 * Link). Diese Mail macht das sichtbar.
 */
export async function sendParticipantEmailChangedToCoach(params: {
  to: string;
  coachName: string;
  customerName: string;
  courseTitle: string;
  url: string;
}): Promise<void> {
  const body = `
    <p>Hallo ${esc(params.coachName)},</p>
    <p>die E-Mail-Adresse des Kunden <strong>${esc(params.customerName)}</strong> (${esc(params.courseTitle)}) wurde geändert.</p>
    <p>Die bisher verschickten Einladungslinks sind dadurch <strong>ungültig</strong> geworden. Bitte benachrichtige den Teilnehmer erneut, damit er die offenen Termine an der neuen Adresse unterschreiben kann.</p>
    ${renderButton(params.url, "Kunde öffnen")}
  `;
  await sendEmail({
    to: params.to,
    subject: `E-Mail geändert – ${params.customerName} bitte erneut einladen`,
    html: renderLayout("E-Mail-Adresse des Kunden geändert", body),
  });
}

/**
 * Betreiber-Alert bei einem Zustell-Problem, das Resend NACH der Annahme
 * meldet (Bounce, Spam-Beschwerde, verzögerte Zustellung). Diese Fälle
 * erzeugen KEINEN Sende-Fehler im normalen Flow — die einzige Quelle ist der
 * Resend-Webhook. Geht an den Betreiber-Posteingang, nicht an Coach/TN.
 *
 * Enthält bewusst die betroffene Empfänger-Adresse (TN-PII) — der Betreiber
 * ist Verantwortlicher und muss wissen, WER nichts bekommen hat, um zu
 * reagieren (anderer Kanal / Adresse korrigieren).
 */
export async function sendDeliveryFailureAlert(params: {
  /** Menschlich lesbares Label des Ereignisses, z.B. "Bounce". */
  eventLabel: string;
  /** Roher Resend-Event-Typ, z.B. "email.bounced". */
  eventType: string;
  /** Betroffene Empfänger-Adresse(n). */
  recipient: string;
  /** Betreff der ursprünglichen Mail, falls im Event enthalten. */
  originalSubject?: string;
  /** Zusatz-Detail (Bounce-Grund o.ä.), best-effort. */
  detail?: string;
  /** Resend-Message-ID zum Nachschlagen im Dashboard. */
  emailId?: string;
  /** Zeitpunkt laut Event. */
  occurredAt: string;
}): Promise<void> {
  const to =
    process.env.RESEND_ALERT_EMAIL ??
    process.env.SUPPORT_ESCALATION_EMAIL ??
    "info@innosee.de";

  const rows: Array<[string, string]> = [
    ["Ereignis", `${params.eventLabel} (${params.eventType})`],
    ["Empfänger", params.recipient],
    ...(params.originalSubject
      ? ([["Betreff", params.originalSubject]] as Array<[string, string]>)
      : []),
    ...(params.detail
      ? ([["Detail", params.detail]] as Array<[string, string]>)
      : []),
    ...(params.emailId
      ? ([["Resend-ID", params.emailId]] as Array<[string, string]>)
      : []),
    ["Zeitpunkt", params.occurredAt],
  ];

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0; color:#888; vertical-align:top; white-space:nowrap;">${esc(
          k,
        )}</td><td style="padding:4px 0; color:#111; word-break:break-word;">${esc(
          v,
        )}</td></tr>`,
    )
    .join("");

  const body = `
    <p>Eine E-Mail konnte einem Teilnehmer <strong>nicht zugestellt</strong> werden. Resend hat das nach der Annahme gemeldet — im normalen Ablauf sieht der Coach davon nichts.</p>
    <table style="border-collapse:collapse; font-size:14px; margin:16px 0;">${rowsHtml}</table>
    <p style="font-size:12px; color:#888;">Prüfe den Fall im Resend-Dashboard und reagiere ggf. (anderer Kanal / Adresse korrigieren).</p>
  `;

  await sendEmail({
    to,
    // Plaintext-Feld → kein HTML-Escaping.
    subject: `Zustellproblem: ${params.eventLabel} an ${params.recipient}`,
    html: renderLayout("Zustellproblem (Resend)", body),
    text: rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
  });
}

export async function sendParticipantMagicLink(params: {
  to: string;
  participantName: string;
  courseTitle: string;
  url: string;
}): Promise<void> {
  // Ein kurs-scoped Link deckt ALLES Offene ab — Termine UND freigegebene
  // Dokumente (DS/TNV/STV/Merge). Der Text ist deshalb bewusst generisch: er
  // wird sowohl bei „Teilnehmer benachrichtigen" (Termine) als auch beim
  // automatischen Versand nach einer Dokument-Freigabe verwendet.
  const body = `
    <p>Hallo ${esc(params.participantName)},</p>
    <p>für dich liegt in der Maßnahme <strong>${esc(params.courseTitle)}</strong> etwas zum Unterschreiben bereit — offene Termine und/oder Dokumente.</p>
    ${renderButton(params.url, "Jetzt öffnen & unterschreiben")}
    <p style="font-size:12px; color:#888;">Der Link ist 7 Tage gültig. Du kannst ihn mehrfach öffnen und darüber alle offenen Punkte erledigen.</p>
  `;
  await sendEmail({
    to: params.to,
    subject: `Zum Unterschreiben – ${params.courseTitle}`,
    html: renderLayout("Zum Unterschreiben bereit", body),
  });
}

/**
 * Mail an den Bildungsträger: ein Coach hat eine Anwesenheitsliste zur Prüfung
 * eingereicht (FES-Gate 3/3). Führt direkt auf die Prüf-Seite.
 */
export async function sendReviewRequestedToBildungstraeger(params: {
  to: string;
  coachName: string;
  courseTitle: string;
  url: string;
}): Promise<void> {
  const body = `
    <p>Hallo,</p>
    <p><strong>${esc(params.coachName)}</strong> hat die Anwesenheitsliste für <strong>${esc(params.courseTitle)}</strong> zur Prüfung eingereicht. Bitte prüfe sie und gib sie frei oder fordere eine Nachbesserung an — mit deiner Freigabe ist der Nachweis abgeschlossen.</p>
    ${renderButton(params.url, "Liste prüfen")}
  `;
  await sendEmail({
    to: params.to,
    subject: `Zu prüfen: ${params.courseTitle}`,
    html: renderLayout("Anwesenheitsliste zur Prüfung", body),
  });
}

/**
 * Mail an den Coach: der Bildungsträger hat die Liste freigegeben. Damit ist
 * der Nachweis abgeschlossen und das finale PDF verfügbar.
 */
export async function sendReviewApprovedToCoach(params: {
  to: string;
  coachName: string;
  courseTitle: string;
  url: string;
}): Promise<void> {
  const body = `
    <p>Hallo ${esc(params.coachName)},</p>
    <p>der Bildungsträger hat die Anwesenheitsliste für <strong>${esc(params.courseTitle)}</strong> geprüft und <strong>freigegeben</strong>. Damit ist die Maßnahme abgeschlossen — das finale PDF steht bereit.</p>
    ${renderButton(params.url, "Zur Maßnahme")}
  `;
  await sendEmail({
    to: params.to,
    subject: `Freigegeben: ${params.courseTitle}`,
    html: renderLayout("Liste freigegeben", body),
  });
}

/**
 * Mail an den Coach: der Bildungsträger fordert eine Nachbesserung. Enthält
 * die Begründung des BT; der Coach kann die Termine korrigieren und neu
 * einreichen.
 */
export async function sendReviewChangesToCoach(params: {
  to: string;
  coachName: string;
  courseTitle: string;
  note: string;
  url: string;
}): Promise<void> {
  const body = `
    <p>Hallo ${esc(params.coachName)},</p>
    <p>der Bildungsträger hat die Anwesenheitsliste für <strong>${esc(params.courseTitle)}</strong> geprüft und bittet um eine <strong>Nachbesserung</strong>:</p>
    <blockquote style="margin:16px 0; padding:12px 16px; border-left:3px solid #d4d4d8; background:#fafafa; color:#333; white-space:pre-wrap;">${esc(params.note)}</blockquote>
    <p>Bitte korrigiere die Termine und reiche die Liste erneut zur Prüfung ein.</p>
    ${renderButton(params.url, "Zur Maßnahme")}
  `;
  await sendEmail({
    to: params.to,
    subject: `Nachbesserung nötig: ${params.courseTitle}`,
    html: renderLayout("Nachbesserung angefordert", body),
  });
}

/**
 * Mail an den/die Bildungsträger-Admin(s) des Mandanten: ein Teilnehmer hat ein
 * Kunde-Dokument (DS/TNV/STV/Merge) fertig unterschrieben. Rein informativ —
 * kein Handlungs-Gate. Führt auf die Dokumentenübersicht des Kunden im
 * Bildungsträger-Bereich.
 */
/**
 * Info-Mail „Kunde hat ein Dokument unterschrieben" an die verwaltende Seite —
 * Bildungsträger bei DS/TNV/Merge, Coach bei der STV. Inhalt ist für beide
 * identisch; nur Empfänger + Link (`url`) unterscheiden sich (setzt der Aufrufer).
 */
export async function sendDocumentSignedNotification(params: {
  to: string;
  documentLabel: string;
  participantName: string;
  courseTitle: string;
  url: string;
}): Promise<void> {
  const body = `
    <p>Hallo,</p>
    <p><strong>${esc(params.participantName)}</strong> hat das Dokument <strong>${esc(
      params.documentLabel,
    )}</strong> für die Maßnahme <strong>${esc(
      params.courseTitle,
    )}</strong> unterschrieben.</p>
    ${renderButton(params.url, "Dokument ansehen")}
  `;
  await sendEmail({
    to: params.to,
    // Plaintext-Betreff → kein HTML-Escaping.
    subject: `Unterschrieben: ${params.documentLabel} – ${params.participantName}`,
    html: renderLayout("Dokument unterschrieben", body),
  });
}

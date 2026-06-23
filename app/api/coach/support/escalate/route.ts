import { NextResponse } from "next/server";

import { getActiveRole, getCurrentSession, getTenantId } from "@/lib/dal";
import { notifySupportEscalation } from "@/lib/support/notify";
import { parseSupportMessages } from "@/lib/support/validate";

export const runtime = "nodejs";

const MAX_NOTE_CHARS = 2_000;

// Eskalation aus dem Coach-Chat: „Mensch kontaktieren". Schickt Verlauf +
// Coach-Kontext per Mail (Resend) und optional an einen Slack/Teams-Webhook.
export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (getActiveRole(session) !== "coach") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body muss JSON sein" }, { status: 400 });
  }

  const parsed = parseSupportMessages(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const rawNote = (body as { note?: unknown }).note;
  const note =
    typeof rawNote === "string" ? rawNote.trim().slice(0, MAX_NOTE_CHARS) : undefined;

  try {
    await notifySupportEscalation({
      coachName: session.user.name,
      coachEmail: session.user.email,
      tenantId: getTenantId(session),
      messages: parsed.messages,
      note,
      occurredAt: new Date(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Support-Eskalation fehlgeschlagen:", err);
    return NextResponse.json(
      {
        error:
          "Die Anfrage konnte nicht zugestellt werden. Bitte schreib uns direkt an info@innosee.de.",
      },
      { status: 502 },
    );
  }
}

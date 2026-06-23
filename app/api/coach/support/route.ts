import { NextResponse } from "next/server";

import { getActiveRole, getCurrentSession } from "@/lib/dal";
import { runSupportChat } from "@/lib/support/azure-chat";
import { parseSupportMessages } from "@/lib/support/validate";

export const runtime = "nodejs";

// Coach-Support-Chat (interaktives FAQ). Nur für eingeloggte Coaches; rein
// lesend (keine DB-Writes), daher kein Impersonation-Block nötig.
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

  try {
    const reply = await runSupportChat(parsed.messages);
    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Support-Chat fehlgeschlagen:", err);
    const status = message.includes("AZURE_OPENAI") ? 503 : 502;
    return NextResponse.json(
      {
        error:
          "Der Support-Assistent ist gerade nicht erreichbar. Bitte versuch es gleich nochmal oder nutze „Mensch kontaktieren“.",
      },
      { status },
    );
  }
}

import { NextResponse } from "next/server";

import { runAzureCheck } from "@/lib/checker/azure-client";
import { isCheckerInput } from "@/lib/checker/types";
import { getCurrentSession, isImpersonating } from "@/lib/dal";

export const runtime = "nodejs";

const MAX_INPUT_CHARS = 30_000;

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "coach") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (isImpersonating(session)) {
    return NextResponse.json(
      {
        error:
          "Schreibende Aktionen sind während Impersonation nicht erlaubt.",
      },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body muss JSON sein" }, { status: 400 });
  }

  if (!isCheckerInput(body)) {
    return NextResponse.json(
      { error: "Body muss { teilnahme, ablauf, fazit } als Strings enthalten" },
      { status: 400 },
    );
  }

  const totalChars = body.teilnahme.length + body.ablauf.length + body.fazit.length;
  if (totalChars === 0) {
    return NextResponse.json(
      { error: "Mindestens ein Abschnitt muss befüllt sein" },
      { status: 400 },
    );
  }
  if (totalChars > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: `Eingabe zu groß (${totalChars} Zeichen, max ${MAX_INPUT_CHARS})` },
      { status: 413 },
    );
  }

  try {
    const result = await runAzureCheck(body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Azure-Check fehlgeschlagen:", err);
    const status = message.includes("AZURE_OPENAI") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

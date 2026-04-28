import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireBildungstraeger } from "@/lib/dal";
import { renderPdfFromUrl } from "@/lib/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

function safeFilename(s: string): string {
  return (
    s
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "ber"
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ berId: string }> },
) {
  await requireBildungstraeger();
  const { berId } = await ctx.params;

  const [row] = await db
    .select({
      id: schema.abschlussberichte.id,
      status: schema.abschlussberichte.status,
      submittedAt: schema.abschlussberichte.submittedAt,
      tnVorname: schema.abschlussberichte.tnVorname,
      tnNachname: schema.abschlussberichte.tnNachname,
      participantName: schema.participants.name,
    })
    .from(schema.abschlussberichte)
    .leftJoin(
      schema.participants,
      eq(schema.participants.id, schema.abschlussberichte.participantId),
    )
    .where(eq(schema.abschlussberichte.id, berId))
    .limit(1);

  if (!row || row.status !== "submitted") {
    return NextResponse.json(
      { error: "Bericht nicht gefunden oder noch nicht eingereicht." },
      { status: 404 },
    );
  }

  const h = await headers();
  const hostHeader = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const originFromRequest = hostHeader ? `${proto}://${hostHeader}` : null;
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? originFromRequest;
  if (!origin) {
    return NextResponse.json(
      { error: "App-URL nicht ermittelbar." },
      { status: 500 },
    );
  }

  const printUrl = `${origin}/bildungstraeger/abschlussberichte/${berId}/print`;
  let cookieDomain = "localhost";
  try {
    cookieDomain = new URL(origin).hostname;
  } catch {
    /* unreachable */
  }

  const allCookies = (await cookies()).getAll();
  const cookieList = allCookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: cookieDomain,
    path: "/",
  }));

  let pdf: Uint8Array;
  try {
    pdf = await renderPdfFromUrl(printUrl, cookieList);
  } catch (err) {
    // Häufigste Ursache lokal: kein PUPPETEER_EXECUTABLE_PATH gesetzt, der
    // Fallback @sparticuz/chromium ist Linux-only und scheitert auf macOS.
    // Auf Vercel klappt's, weil dort Linux + Chromium-Layer vorhanden sind.
    // Server-Log zeigt den vollen Stack — Response surfacet die Message,
    // damit Coaches/BTs nicht raten müssen.
    console.error("BER PDF generation failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "PDF-Erzeugung fehlgeschlagen.",
        detail: msg,
        hint: process.env.NODE_ENV === "production"
          ? undefined
          : "Lokal: setze PUPPETEER_EXECUTABLE_PATH auf System-Chrome (z.B. /Applications/Google Chrome.app/Contents/MacOS/Google Chrome) in .env.local.",
      },
      { status: 500 },
    );
  }

  // Filename: Nachname_Vorname_BER_YYYYMMDD.pdf — durchsuchbar im Datei-
  // Explorer/Mail-Client. Fallback auf participant.name (für Legacy-BERs
  // ohne Snapshot) oder generisch.
  const dateStr = row.submittedAt
    ? new Date(row.submittedAt).toISOString().slice(0, 10).replace(/-/g, "")
    : "submitted";
  const nachname = row.tnNachname || splitNachname(row.participantName) || "";
  const vorname = row.tnVorname || splitVorname(row.participantName) || "";
  const namePart =
    nachname && vorname
      ? `${safeFilename(nachname)}_${safeFilename(vorname)}`
      : nachname
        ? safeFilename(nachname)
        : safeFilename(row.participantName ?? "BER");
  const filename = `${namePart}_BER_${dateStr}.pdf`;

  return new NextResponse(pdf as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// Naive Splitter für Legacy-Rows ohne Vorname/Nachname-Snapshot.
// Annahme: erstes Wort = Vorname, Rest = Nachname.
function splitVorname(name: string | null | undefined): string {
  if (!name) return "";
  const i = name.indexOf(" ");
  return i < 0 ? name : name.slice(0, i);
}
function splitNachname(name: string | null | undefined): string {
  if (!name) return "";
  const i = name.indexOf(" ");
  return i < 0 ? "" : name.slice(i + 1).trim();
}

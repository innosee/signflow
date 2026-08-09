import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import { renderPdfFromUrl } from "@/lib/pdf";
import { hasTnbAccess, TNB_ACCESS_COOKIE } from "@/lib/documents/tnb-access";
import { decodeTnbParams, encodeTnbParams, tnbFullName } from "@/lib/documents/tnb-public";

// Node-Runtime (Puppeteer/Chromium läuft nicht auf Edge). Route-Pfad endet auf
// `/pdf` → greift den outputFileTracingIncludes-Glob (`/api/**/pdf`) für die
// @sparticuz/chromium-Binary auf Vercel.
export const runtime = "nodejs";
export const maxDuration = 60;

function safeFilename(value: string): string {
  return (
    value
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "teilnahmebescheinigung"
  );
}

export async function GET(req: Request) {
  // Zugangscode-Gate (verhindert Direktaufruf unter Umgehung des Formulars).
  if (!(await hasTnbAccess())) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 404 });
  }

  const reqUrl = new URL(req.url);
  const input = decodeTnbParams(
    Object.fromEntries(
      // Wiederholte Params (key/custom) als Array sammeln.
      [...reqUrl.searchParams.keys()].map((k) => {
        const all = reqUrl.searchParams.getAll(k);
        return [k, all.length > 1 ? all : all[0]];
      }),
    ),
  );

  const h = await headers();
  const hostHeader = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const originFromRequest = hostHeader ? `${proto}://${hostHeader}` : null;
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? originFromRequest;
  if (!origin) {
    return NextResponse.json({ error: "App-URL nicht ermittelbar." }, { status: 500 });
  }

  // Kanonische Query neu aufbauen (defensiv gegen Fremd-Params) und an die
  // gate-geschützte Print-Seite hängen.
  const printUrl = `${origin}/tnb/print?${encodeTnbParams(input).toString()}`;

  // Access-Cookie an den Headless-Browser weiterreichen, damit /tnb/print (das
  // dasselbe Gate hat) die Bescheinigung rendert statt der Code-Abfrage.
  let cookieDomain = "localhost";
  try {
    cookieDomain = new URL(origin).hostname;
  } catch {
    // sicherer Default
  }
  const accessValue = (await cookies()).get(TNB_ACCESS_COOKIE)?.value;
  const cookieList = accessValue
    ? [{ name: TNB_ACCESS_COOKIE, value: accessValue, domain: cookieDomain, path: "/" }]
    : [];

  let pdf: Uint8Array;
  try {
    pdf = await renderPdfFromUrl(printUrl, cookieList);
  } catch (err) {
    console.error("TNB PDF generation failed:", err);
    return NextResponse.json({ error: "PDF-Erzeugung fehlgeschlagen." }, { status: 500 });
  }

  const name = tnbFullName(input) || "teilnehmer";
  const filename = `teilnahmebescheinigung-${safeFilename(name)}.pdf`;
  return new NextResponse(pdf as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

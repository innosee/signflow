import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireCoach } from "@/lib/dal";
import { renderPdfFromUrl } from "@/lib/pdf";

// Serverless-Function-Runtime: Node (Edge kann keine nativen Binärpakete
// wie `@sparticuz/chromium` laden). Max. 60s auf Vercel Pro — PDF-Render
// braucht Cold-Start inkl. Chromium-Unpack typisch 5-10s.
export const runtime = "nodejs";
export const maxDuration = 60;

function safeFilename(title: string): string {
  return title
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "stundennachweis";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; participantId: string }> },
) {
  const session = await requireCoach();
  const { id: courseId, participantId } = await ctx.params;

  // Ownership + Enrollment-Gate spiegelt den Print-Route-Check, damit ein
  // Coach keine fremden Nachweise headless rendern + downloaden kann.
  const [ctxRow] = await db
    .select({ id: schema.courses.id, title: schema.courses.title })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.coachId, session.user.id),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);
  if (!ctxRow) {
    return NextResponse.json({ error: "Kurs nicht gefunden." }, { status: 404 });
  }

  const [enrolled] = await db
    .select({
      id: schema.courseParticipants.id,
      participantName: schema.participants.name,
    })
    .from(schema.courseParticipants)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courseParticipants.participantId),
    )
    .where(
      and(
        eq(schema.courseParticipants.courseId, courseId),
        eq(schema.courseParticipants.participantId, participantId),
      ),
    )
    .limit(1);
  if (!enrolled) {
    return NextResponse.json(
      { error: "Teilnehmer nicht im Kurs eingeschrieben." },
      { status: 404 },
    );
  }

  // Absolute URL für Puppeteer — entweder der konfigurierte App-URL
  // (Production) oder der Host des aktuellen Requests (Vercel Preview,
  // Local Dev). NEXT_PUBLIC_APP_URL zeigt in Prod auf den stabilen Host.
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

  const printUrl = `${origin}/coach/courses/${courseId}/print/${participantId}`;
  // Domain für `page.setCookie` muss hostname-only (ohne Port) sein —
  // Puppeteer lehnt sonst den Cookie ab.
  let cookieDomain = "localhost";
  try {
    cookieDomain = new URL(origin).hostname;
  } catch {
    // origin-Parse-Fehler ist praktisch unerreichbar (we built the URL
    // above), aber ein sicherer Default schlägt besser als ein Crash.
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
    console.error("PDF generation failed:", err);
    return NextResponse.json(
      { error: "PDF-Erzeugung fehlgeschlagen." },
      { status: 500 },
    );
  }

  const filename = `stundennachweis-${safeFilename(ctxRow.title)}-${safeFilename(enrolled.participantName)}.pdf`;
  return new NextResponse(pdf as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

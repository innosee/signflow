import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { courseVisibleToCoach } from "@/lib/course-access";
import { requireCoach } from "@/lib/dal";
import { getDocumentConfig, type DocumentTypeId } from "@/lib/documents/config";
import { renderPdfFromUrl } from "@/lib/pdf";

// Node-Runtime (Puppeteer/Chromium kann nicht auf Edge laufen).
export const runtime = "nodejs";
export const maxDuration = 60;

function safeFilename(value: string): string {
  return (
    value
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "dokument"
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ docId: string }> },
) {
  const session = await requireCoach();
  const { docId } = await ctx.params;

  // Zugriffs-Gate spiegelt die Print-Route.
  const [doc] = await db
    .select({
      courseId: schema.documents.courseId,
      type: schema.documents.type,
      courseTitle: schema.courses.title,
    })
    .from(schema.documents)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.documents.courseId))
    .where(
      and(
        eq(schema.documents.id, docId),
        isNull(schema.documents.deletedAt),
        isNull(schema.courses.deletedAt),
        courseVisibleToCoach(session.user.id),
      ),
    )
    .limit(1);
  if (!doc) {
    return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });
  }

  const h = await headers();
  const hostHeader = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const originFromRequest = hostHeader ? `${proto}://${hostHeader}` : null;
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? originFromRequest;
  if (!origin) {
    return NextResponse.json({ error: "App-URL nicht ermittelbar." }, { status: 500 });
  }

  const printUrl = `${origin}/coach/courses/${doc.courseId}/dokumente/${docId}/print`;
  let cookieDomain = "localhost";
  try {
    cookieDomain = new URL(origin).hostname;
  } catch {
    // sicherer Default
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
    console.error("Document PDF generation failed:", err);
    return NextResponse.json({ error: "PDF-Erzeugung fehlgeschlagen." }, { status: 500 });
  }

  const cfg = getDocumentConfig(doc.type as DocumentTypeId);
  const filename = `${safeFilename(cfg.formNumber)}-${safeFilename(cfg.label)}-${safeFilename(doc.courseTitle)}.pdf`;
  return new NextResponse(pdf as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

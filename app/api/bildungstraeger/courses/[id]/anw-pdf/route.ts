import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";
import { renderPdfFromUrl } from "@/lib/pdf";

// Node-Runtime: Puppeteer/@sparticuz/chromium läuft nicht auf Edge.
export const runtime = "nodejs";
export const maxDuration = 60;

function safeFilename(s: string): string {
  return (
    s
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "stundennachweis"
  );
}

/**
 * Bildungsträger-Download des gesiegelten Stundennachweises (ANW). Eigener
 * Endpoint, weil der Coach-Endpoint (`/api/courses/.../pdf`) coach-scoped ist
 * und einen BT abweist. Tenant-Gate via Coach-innerJoin; Download nur, wenn
 * der FES-Siegel-Schritt abgeschlossen ist (`fes_status='completed'`) — passt
 * zur Cockpit-Regel „ANW-PDF erst nach Siegel".
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);
  const { id: courseId } = await ctx.params;

  const [row] = await db
    .select({
      participantId: schema.courses.participantId,
      title: schema.courses.title,
      participantName: schema.participants.name,
      fesStatus: schema.finalDocuments.fesStatus,
    })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .leftJoin(
      schema.finalDocuments,
      eq(schema.finalDocuments.courseId, schema.courses.id),
    )
    .where(
      and(
        eq(schema.courses.id, courseId),
        eq(schema.users.tenantId, tenantId),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Kunde nicht gefunden." }, { status: 404 });
  }
  // Kein Abschluss-Gate: der Bildungsträger darf die ANW jederzeit als PDF
  // ziehen (auch vor der Freigabe), z. B. um sie vor dem Abschließen zu
  // prüfen. Das PDF rendert den aktuellen Stand. Zugriff bleibt tenant-scoped
  // (siehe innerJoin auf users.tenant_id oben).

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

  const printUrl = `${origin}/bildungstraeger/courses/${courseId}/print/${row.participantId}`;
  let cookieDomain = "localhost";
  try {
    cookieDomain = new URL(origin).hostname;
  } catch {
    /* unreachable — origin ist oben gebaut */
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
    console.error("ANW PDF generation failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "PDF-Erzeugung fehlgeschlagen.",
        detail: msg,
        hint:
          process.env.NODE_ENV === "production"
            ? undefined
            : "Lokal: setze PUPPETEER_EXECUTABLE_PATH auf System-Chrome in .env.local.",
      },
      { status: 500 },
    );
  }

  const filename = `stundennachweis-${safeFilename(row.title)}-${safeFilename(row.participantName)}.pdf`;
  return new NextResponse(pdf as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { db, schema } from "@/db";
import { getCurrentSession, isImpersonating } from "@/lib/dal";
import { deleteBlob, uploadBrandingLogo } from "@/lib/storage";

const MAX_BYTES = 1_000_000; // 1 MB — reicht für PDF-Header-Logos
const ACCEPTED_TYPES: Record<string, "png" | "jpg" | "svg"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

/**
 * Logo-Upload für den PDF-Header. Nur Bildungsträger berechtigt — Coaches
 * teilen sich das Branding ihres Mandanten.
 */
export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "bildungstraeger") {
    return NextResponse.json(
      { error: "Nur der Bildungsträger darf das Logo ändern." },
      { status: 403 },
    );
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

  const formData = await req.formData();
  const file = formData.get("logo");

  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Missing `logo` file field" },
      { status: 400 },
    );
  }
  const extension = ACCEPTED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: "Logo muss PNG, JPEG oder SVG sein." },
      { status: 415 },
    );
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Dateigröße muss zwischen 1 B und ${MAX_BYTES} B liegen.` },
      { status: 413 },
    );
  }

  const userId = session.user.id;
  let url: string;
  try {
    url = await uploadBrandingLogo(`bt-${userId}`, file, extension);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Logo upload failed:", err);
    const status = message.includes("BLOB_READ_WRITE_TOKEN") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  const [previous] = await db
    .select({ pdfLogoUrl: schema.users.pdfLogoUrl })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  await db
    .update(schema.users)
    .set({ pdfLogoUrl: url })
    .where(eq(schema.users.id, userId));

  if (previous?.pdfLogoUrl && previous.pdfLogoUrl !== url) {
    await deleteBlob(previous.pdfLogoUrl).catch(() => {
      // Verwaister Blob ist kein Abbruch-Grund.
    });
  }

  // Settings-Page + Coach-Export ziehen das neue Logo nach Refresh.
  revalidatePath("/bildungstraeger/settings");
  revalidatePath("/coach/checker/export");

  return NextResponse.json({ url });
}

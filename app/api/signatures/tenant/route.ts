import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import {
  getActiveRole,
  getCurrentSession,
  getTenantId,
  isImpersonating,
} from "@/lib/dal";
import { uploadSignature } from "@/lib/storage";

const MAX_BYTES = 500_000;
const ACCEPTED_TYPE = "image/png";

/**
 * Setzt die geteilte Organisations-Unterschrift des Bildungsträgers
 * (`tenants.signature_url`) — EINE pro Tenant, von jedem BT-Admin des Tenants
 * setzbar. Sie erscheint als zweite Signaturzeile auf den BT-Dokumenten.
 *
 * Alte Blobs werden beim Re-Upload bewusst NICHT gelöscht: sie sind der
 * Snapshot, den bereits freigegebene/abgeschlossene Dokumente über
 * `document_signatures.signature_url` referenzieren (Beweismittel). Ein Cleanup
 * echter Waisen erfolgt später separat.
 */
export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (getActiveRole(session) !== "bildungstraeger") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (isImpersonating(session)) {
    return NextResponse.json(
      {
        error: "Schreibende Aktionen sind während Impersonation nicht erlaubt.",
      },
      { status: 403 },
    );
  }
  const tenantId = getTenantId(session);

  const formData = await req.formData();
  const file = formData.get("signature");

  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Missing `signature` file field" },
      { status: 400 },
    );
  }
  if (file.type !== ACCEPTED_TYPE) {
    return NextResponse.json(
      { error: `Content-Type muss ${ACCEPTED_TYPE} sein` },
      { status: 415 },
    );
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Dateigröße muss zwischen 1 B und ${MAX_BYTES} B liegen` },
      { status: 413 },
    );
  }

  let url: string;
  try {
    url = await uploadSignature(`tenant-${tenantId}`, file);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Tenant signature upload failed:", err);
    const isConfig = message.includes("BLOB_READ_WRITE_TOKEN");
    return NextResponse.json(
      {
        error: isConfig
          ? "Storage ist aktuell nicht konfiguriert. Bitte wende dich an den Support."
          : "Upload fehlgeschlagen. Bitte erneut versuchen.",
      },
      { status: isConfig ? 503 : 500 },
    );
  }

  await db
    .update(schema.tenants)
    .set({ signatureUrl: url })
    .where(eq(schema.tenants.id, tenantId));

  return NextResponse.json({ url });
}

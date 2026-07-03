import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import { getCurrentSession, isImpersonating } from "@/lib/dal";
import { deleteBlob, uploadSignature } from "@/lib/storage";

const MAX_BYTES = 500_000;
const ACCEPTED_TYPE = "image/png";

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const userId = session.user.id;
  let url: string;
  try {
    url = await uploadSignature(`user-${userId}`, file);
  } catch (err) {
    // Fehler-Internals (Storage-Provider-Namen, Stack-Traces) bleiben im
    // Server-Log — der Client sieht nur eine generische Meldung (analog zur
    // TN-Route). Fehlt der Token, ist es ein Config-Problem der Umgebung →
    // 503 mit klarem Hinweis statt 500er Black Box.
    const message = err instanceof Error ? err.message : String(err);
    console.error("Signature upload failed:", err);
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

  const [previous] = await db
    .select({ signatureUrl: schema.users.signatureUrl })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  await db
    .update(schema.users)
    .set({ signatureUrl: url })
    .where(eq(schema.users.id, userId));

  if (previous?.signatureUrl && previous.signatureUrl !== url) {
    // Der alte Wert ist derselbe Object-Key, den bereits erstellte
    // signatures-Zeilen als Snapshot referenzieren (das PDF wird live aus
    // diesen Snapshots gerendert). Ihn beim Re-Upload zu löschen würde alle
    // bisherigen Unterschriften — auch in bereits abgeschlossenen Nachweisen —
    // zerstören; das sind Beweismittel für die AfA. Deshalb nur löschen, wenn
    // KEINE Signatur mehr darauf zeigt (echter Waise).
    const [stillReferenced] = await db
      .select({ url: schema.signatures.signatureUrl })
      .from(schema.signatures)
      .where(eq(schema.signatures.signatureUrl, previous.signatureUrl))
      .limit(1);
    if (!stillReferenced) {
      await deleteBlob(previous.signatureUrl).catch(() => {
        // Verwaister Blob ist kein Abbruch-Grund — Cleanup-Job später.
      });
    }
  }

  return NextResponse.json({ url });
}

import crypto from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import { deleteBlob, uploadSignature } from "@/lib/storage";

const MAX_BYTES = 500_000;
const ACCEPTED_TYPE = "image/png";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

/**
 * TN-Signatur-Upload via Magic-Link. Auth läuft NICHT über Better-Auth,
 * sondern über den im FormData mitgegebenen Kurs-scoped Token — der muss
 * gültig + unbenutzt sein und auflösbar zu einem Teilnehmer. Danach wird
 * `participants.signature_url` einmalig gesetzt (und beim Re-Upload
 * aktualisiert + der alte Blob entsorgt).
 */
export async function POST(req: Request) {
  const formData = await req.formData();
  const token = String(formData.get("token") ?? "");
  const file = formData.get("signature");

  if (!token) {
    return NextResponse.json({ error: "Token fehlt." }, { status: 400 });
  }
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

  const tokenHash = hashToken(token);
  const [tok] = await db
    .select({ participantId: schema.participantAccessTokens.participantId })
    .from(schema.participantAccessTokens)
    .where(
      and(
        eq(schema.participantAccessTokens.tokenHash, tokenHash),
        isNull(schema.participantAccessTokens.usedAt),
        gt(schema.participantAccessTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!tok) {
    return NextResponse.json(
      {
        error:
          "Link ist abgelaufen oder wurde durch einen neueren ersetzt. Bitte neuen Link beim Coach anfordern.",
      },
      { status: 401 },
    );
  }

  const participantId = tok.participantId;
  let url: string;
  try {
    url = await uploadSignature(`participant-${participantId}`, file);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Participant signature upload failed:", err);
    const status = message.includes("BLOB_READ_WRITE_TOKEN") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  const [previous] = await db
    .select({ signatureUrl: schema.participants.signatureUrl })
    .from(schema.participants)
    .where(eq(schema.participants.id, participantId))
    .limit(1);

  await db
    .update(schema.participants)
    .set({ signatureUrl: url })
    .where(eq(schema.participants.id, participantId));

  if (previous?.signatureUrl && previous.signatureUrl !== url) {
    await deleteBlob(previous.signatureUrl).catch(() => {
      // Verwaister Blob ist kein Abbruch-Grund — Cleanup-Job später.
    });
  }

  return NextResponse.json({ url });
}

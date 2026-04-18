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
  const url = await uploadSignature(`user-${userId}`, file);

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
    await deleteBlob(previous.signatureUrl).catch(() => {
      // Verwaister Blob ist kein Abbruch-Grund — wird später durch Cleanup-Job behandelt.
    });
  }

  return NextResponse.json({ url });
}

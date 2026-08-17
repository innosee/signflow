import crypto from "node:crypto";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { shouldDeleteReplacedSignatureBlob } from "@/lib/signature-blob-cleanup";
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
    .select({
      participantId: schema.participantAccessTokens.participantId,
      courseId: schema.participantAccessTokens.courseId,
    })
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
  const courseId = tok.courseId;
  let url: string;
  try {
    url = await uploadSignature(`participant-${participantId}`, file);
  } catch (err) {
    // Fehler-Internals (Storage-Provider-Namen, Stack-Traces) bleiben im
    // Server-Log — der Client sieht nur eine generische Meldung.
    const message = err instanceof Error ? err.message : String(err);
    console.error("Participant signature upload failed:", err);
    const isConfig = message.includes("BLOB_READ_WRITE_TOKEN");
    return NextResponse.json(
      {
        error: isConfig
          ? "Storage ist aktuell nicht konfiguriert. Bitte melde dich beim Coach."
          : "Upload fehlgeschlagen. Bitte erneut versuchen.",
      },
      { status: isConfig ? 503 : 500 },
    );
  }

  const [previous] = await db
    .select({ signatureUrl: schema.participants.signatureUrl })
    .from(schema.participants)
    .where(eq(schema.participants.id, participantId))
    .limit(1);

  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? undefined;

  await db.transaction(async (tx) => {
    await tx
      .update(schema.participants)
      .set({ signatureUrl: url })
      .where(eq(schema.participants.id, participantId));

    // Beim ERSTEN Anlegen gibt es noch keine Signatur-Snapshots (die Termine
    // werden erst danach bestätigt) — dann ist das hier ein No-Op. Der
    // relevante Fall ist das ÄNDERN einer bereits genutzten Unterschrift
    // (z.B. ein versehentlicher „Punkt"): das finale PDF rendert pro Termin
    // die gespeicherte Snapshot-URL aus `signatures`/`document_signatures`
    // (siehe sheet-data.ts), NICHT die aktuelle `participants.signature_url`.
    // Ohne Nachziehen bliebe die alte Unterschrift auf allen schon bestätigten
    // Terminen/Dokumenten stehen. Wir biegen deshalb die Teilnehmer-Snapshots
    // dieses Kurses auf die neue URL um — derselbe Bestätigungs-Akt
    // (Zeitstempel + IP) bleibt erhalten, nur das Bild wird korrigiert.
    if (previous?.signatureUrl && previous.signatureUrl !== url) {
      // Guard: einen bereits abgeschlossenen/übermittelten Nachweis NICHT
      // still nachträglich verändern. Ist der Kurs finalisiert
      // (final_documents.fes_status = 'completed'), bleibt die Korrektur
      // Coach-seitig über „Signaturen zurücksetzen" — hier nur die
      // wiederverwendbare Unterschrift aktualisieren, keine Snapshots.
      const [finalDoc] = await tx
        .select({ id: schema.finalDocuments.id })
        .from(schema.finalDocuments)
        .where(
          and(
            eq(schema.finalDocuments.courseId, courseId),
            eq(schema.finalDocuments.fesStatus, "completed"),
          ),
        )
        .limit(1);

      if (!finalDoc) {
        const sessionRows = await tx
          .select({ id: schema.sessions.id })
          .from(schema.sessions)
          .where(
            and(
              eq(schema.sessions.courseId, courseId),
              isNull(schema.sessions.deletedAt),
            ),
          );
        const sessionIds = sessionRows.map((s) => s.id);

        const docRows = await tx
          .select({ id: schema.documents.id })
          .from(schema.documents)
          .where(
            and(
              eq(schema.documents.courseId, courseId),
              isNull(schema.documents.deletedAt),
            ),
          );
        const documentIds = docRows.map((d) => d.id);

        if (sessionIds.length > 0) {
          await tx
            .update(schema.signatures)
            .set({ signatureUrl: url })
            .where(
              and(
                eq(schema.signatures.participantId, participantId),
                eq(schema.signatures.signerType, "participant"),
                inArray(schema.signatures.sessionId, sessionIds),
              ),
            );
        }
        if (documentIds.length > 0) {
          await tx
            .update(schema.documentSignatures)
            .set({ signatureUrl: url })
            .where(
              and(
                eq(schema.documentSignatures.participantId, participantId),
                eq(schema.documentSignatures.signerType, "participant"),
                inArray(schema.documentSignatures.documentId, documentIds),
              ),
            );
        }

        await logAudit(
          {
            actorType: "participant",
            actorId: participantId,
            action: "signature.participant_corrected",
            resourceType: "participant",
            resourceId: participantId,
            metadata: {
              courseId,
              sessionsRepointed: sessionIds.length,
              documentsRepointed: documentIds.length,
            },
            ipAddress,
            userAgent,
          },
          tx,
        );
      }
    }
  });

  if (previous?.signatureUrl && previous.signatureUrl !== url) {
    // Nur löschen, wenn keine signatures-Zeile den alten Object-Key mehr als
    // Snapshot referenziert — sonst zerstört der Re-Upload die Unterschriften
    // in bereits erstellten (ggf. abgeschlossenen) Nachweisen. Siehe
    // ausführlicher Kommentar in app/api/signatures/me/route.ts.
    const [stillReferenced] = await db
      .select({ url: schema.signatures.signatureUrl })
      .from(schema.signatures)
      .where(eq(schema.signatures.signatureUrl, previous.signatureUrl))
      .limit(1);
    if (
      shouldDeleteReplacedSignatureBlob({
        previousUrl: previous.signatureUrl,
        newUrl: url,
        isStillReferenced: !!stillReferenced,
      })
    ) {
      await deleteBlob(previous.signatureUrl).catch(() => {
        // Verwaister Blob ist kein Abbruch-Grund — Cleanup-Job später.
      });
    }
  }

  return NextResponse.json({ url });
}

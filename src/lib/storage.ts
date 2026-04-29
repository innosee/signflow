import "server-only";

import { del, put } from "@vercel/blob";

function assertToken(): void {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Link a Vercel Blob store and run `vercel env pull .env.local`.",
    );
  }
}

/**
 * Provider-agnostischer Signatur-Upload. Rückgabe ist die URL, die in
 * `users.signature_url` / `participants.signature_url` /
 * `signatures.signature_url` persistiert wird.
 *
 * **Privacy-Modell im MVP (Vercel Blob):**
 * `access: "public"` ist aktuell die einzige unterstützte Variante.
 * Mitigation: `addRandomSuffix: true` hängt 256 Bit Entropie an die URL an,
 * sodass sie praktisch unerratbar ist. Die App gibt Blob-URLs ausschließlich
 * server-seitig nach DAL-Auth heraus — Clients bekommen sie nicht direkt aus
 * öffentlichen Endpoints.
 *
 * **TODO(privacy, pre-prod):** Für AfA-Compliance vor Production entweder
 * - auf Cloudflare R2 / S3 mit `access: "private"` + kurzlebigen Signed URLs
 *   migrieren (Storage-Anbieter-Entscheidung steht in CLAUDE.md noch offen),
 *   oder
 * - einen authorisierten Proxy-Endpoint bauen, der den Blob erst nach
 *   Auth-/Ownership-Check streamt, und die öffentliche URL nie rausgibt.
 *
 * Migration zu R2 o.ä. betrifft nur diese Datei.
 */
export async function uploadSignature(
  ownerKey: string,
  png: Blob,
): Promise<string> {
  assertToken();
  const path = `signatures/${ownerKey}/${Date.now()}.png`;
  const { url } = await put(path, png, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return url;
}

/**
 * Logo-Upload für PDF-Branding. Bewusst kein Re-Encoding: das vom Bildungs-
 * träger hochgeladene PNG/JPEG/SVG landet 1:1 im Blob-Store, damit das
 * PDF-Layout deterministisch bleibt. Validierung (Content-Type/Größe)
 * passiert im API-Handler.
 */
export async function uploadBrandingLogo(
  ownerKey: string,
  file: Blob,
  extension: "png" | "jpg" | "svg",
): Promise<string> {
  assertToken();
  const path = `branding/${ownerKey}/${Date.now()}.${extension}`;
  const { url } = await put(path, file, {
    access: "public",
    contentType: file.type,
    addRandomSuffix: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return url;
}

export async function deleteBlob(url: string): Promise<void> {
  assertToken();
  await del(url);
}

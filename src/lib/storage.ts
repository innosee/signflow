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
 * Provider-agnostischer Signatur-Upload. Rückgabe ist eine öffentlich lesbare
 * URL, die direkt in `users.signature_url` / `participants.signature_url`
 * oder `signatures.signature_url` gespeichert werden kann.
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

export async function deleteBlob(url: string): Promise<void> {
  assertToken();
  await del(url);
}

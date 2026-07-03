import "server-only";

import { cache } from "react";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { del as vercelBlobDel, put as vercelBlobPut } from "@vercel/blob";

/**
 * Storage-Layer für Signaturen, Logos und gesiegelte PDFs.
 *
 * **Provider:** Cloudflare R2 (S3-kompatibel) als Standard. Fallback auf
 * Vercel Blob, wenn keine R2-Credentials gesetzt sind — z.B. in lokalen
 * Dev-Umgebungen ohne `vercel env pull`.
 *
 * **Privacy-Modell:** R2-Bucket ist privat. Read-Access via signierte URLs
 * (24 h TTL). Vorher (Vercel Blob `access: "public"` + Random-Suffix) war
 * Mitigation gegen Erratbarkeit; jetzt zusätzlich Authentifizierung
 * gegenüber dem Storage-Provider.
 *
 * **Werte in der DB:**
 *  - Neue Uploads: Object-Key (z.B. `signatures/user-uuid/123.png`).
 *  - Bestand aus Vercel-Blob-Zeit: vollständige `https://...`-URL.
 *  Beim Render wird `resolveAssetUrl()` aufgerufen, das beide Formate
 *  handhabt (Key → signed URL; URL → unverändert).
 *
 * **Migration:** `scripts/migrate-blobs-to-r2.mjs` (separat, mit
 * User-Confirmation) verschiebt existierende Vercel-Blobs nach R2 und
 * ersetzt URLs durch Keys in der DB.
 */

type Provider = "r2" | "vercel-blob";

function activeProvider(): Provider {
  if (process.env.R2_ACCOUNT_ID) return "r2";
  // Kein R2 konfiguriert. In Production NICHT still auf öffentlichen Vercel Blob
  // zurückfallen: Signaturen und gesiegelte PDFs von Sozialleistungsempfängern
  // dürfen nicht public (mit 1-Jahr-CDN-Cache) erreichbar landen. Lieber ein
  // harter Upload-Fehler als eine stille Datenschutz-Degradierung. Analog zum
  // Prod-Fail-hard-Pattern in email.ts / sms.ts. `activeProvider()` wird nur von
  // den Upload-Pfaden gerufen — Löschen/Auflösen von Bestands-Blobs (Vercel-Blob-
  // URLs aus der Migrationszeit) bleibt unberührt.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Storage ist in Production nicht korrekt konfiguriert (R2_ACCOUNT_ID fehlt) — " +
        "der Fallback auf öffentlichen Vercel Blob ist in Prod deaktiviert.",
    );
  }
  return "vercel-blob";
}

// --- R2 (S3-kompatibel) ---

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials missing (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY).",
    );
  }
  // EU-jurisdiction-Buckets brauchen den jurisdiction-spezifischen
  // Endpoint (`<account>.eu.r2.cloudflarestorage.com`), sonst gibt R2
  // 403 AccessDenied. Default ist „eu" weil unser Bucket EU-only ist;
  // wer einen Default-jurisdiction-Bucket hat, setzt R2_JURISDICTION=default.
  const jurisdiction = process.env.R2_JURISDICTION ?? "eu";
  const endpoint =
    jurisdiction === "default"
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`;
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME missing.");
  return bucket;
}

async function r2Put(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

async function r2Delete(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: key }),
  );
}

async function r2SignedGetUrl(key: string, ttlSec: number): Promise<string> {
  const client = getR2Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }),
    { expiresIn: ttlSec },
  );
}

// --- Vercel Blob (Legacy / Local-Dev-Fallback) ---

function vercelBlobAssertToken(): void {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Either configure R2 (R2_ACCOUNT_ID etc.) or link a Vercel Blob store.",
    );
  }
}

// --- Public API ---

/** Zufälliges Suffix für Object-Keys, damit gleichnamige Uploads kollisionsfrei sind. */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Lädt eine PNG-Signatur hoch. Gibt einen Object-Key (R2) oder eine
 * Public-URL (Vercel-Blob) zurück — je nachdem welcher Provider aktiv ist.
 */
export async function uploadSignature(
  ownerKey: string,
  png: Blob,
): Promise<string> {
  const ts = Date.now();
  const path = `signatures/${ownerKey}/${ts}-${randomSuffix()}.png`;

  if (activeProvider() === "r2") {
    const buf = Buffer.from(await png.arrayBuffer());
    await r2Put(path, buf, "image/png");
    return path; // Object-Key, wird beim Render via resolveAssetUrl() gesigned
  }

  vercelBlobAssertToken();
  const { url } = await vercelBlobPut(path, png, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return url;
}

/**
 * Lädt ein Logo (PNG/JPG/SVG) für PDF-Branding hoch. Wie uploadSignature
 * gibt der Rückgabewert je nach aktivem Provider Key oder URL zurück.
 */
export async function uploadBrandingLogo(
  ownerKey: string,
  file: Blob,
  extension: "png" | "jpg" | "svg",
): Promise<string> {
  const ts = Date.now();
  const path = `branding/${ownerKey}/${ts}-${randomSuffix()}.${extension}`;

  if (activeProvider() === "r2") {
    const buf = Buffer.from(await file.arrayBuffer());
    await r2Put(path, buf, file.type);
    return path;
  }

  vercelBlobAssertToken();
  const { url } = await vercelBlobPut(path, file, {
    access: "public",
    contentType: file.type,
    addRandomSuffix: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return url;
}

/**
 * Löscht ein Asset aus dem Storage. Akzeptiert sowohl Object-Keys (R2,
 * neue Uploads) als auch vollständige URLs (Vercel-Blob, Bestand).
 */
export async function deleteAsset(keyOrUrl: string): Promise<void> {
  if (isVercelBlobUrl(keyOrUrl)) {
    vercelBlobAssertToken();
    await vercelBlobDel(keyOrUrl);
    return;
  }
  // Object-Key → R2
  await r2Delete(keyOrUrl);
}

/** Backwards-compat alias — alter Name wird noch von ein paar Stellen genutzt. */
export const deleteBlob = deleteAsset;

/**
 * Macht aus einem gespeicherten Asset-Wert (Key oder URL) einen
 * abrufbaren URL-String. Wird von Server-Components aufgerufen, die
 * Signaturen oder Logos in `<img src=…>` rendern.
 *
 * - Object-Key (R2) → presigned URL mit TTL (default 24 h)
 * - https://-URL (Vercel-Blob) → unverändert (public + random suffix
 *   bietet weiterhin Mitigation gegen Erratbarkeit, bis die Migration
 *   nach R2 läuft)
 *
 * `cache()` aus React stellt sicher dass mehrere Aufrufe für denselben
 * Key innerhalb eines Renders nur einmal sign'en — Server-Components
 * können den Helper frei in Loops nutzen ohne N+1 zu produzieren.
 */
export const resolveAssetUrl = cache(
  async (keyOrUrl: string | null | undefined): Promise<string | null> => {
    if (!keyOrUrl) return null;
    if (isVercelBlobUrl(keyOrUrl)) return keyOrUrl;
    if (isAbsoluteUrl(keyOrUrl)) return keyOrUrl;
    return r2SignedGetUrl(keyOrUrl, 60 * 60 * 24);
  },
);

function isVercelBlobUrl(value: string): boolean {
  return /^https?:\/\/[^/]*\.public\.blob\.vercel-storage\.com\//.test(value);
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

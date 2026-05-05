import { config } from "dotenv";
import {
  HeadBucketCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// Lokales R2-Diagnose-Skript. Lädt die R2_*-Env-Vars aus dem Vercel-
// Pull (`.env.preview.local` oder ähnlich) und versucht einen winzigen
// Test-Upload, damit wir sehen wo „Access Denied" wirklich herkommt.
//
// Nutzung:
//   1) Im Vercel-Dashboard die Sensitive-Markierung auf R2_*-Variablen
//      kurz aufheben (sonst pull liefert leeren String) — oder per Hand
//      aus dem Notizbuch in eine Datei `.env.r2.local` schreiben.
//   2) `vercel env pull --environment=preview .env.r2.local` (oder manuell
//      die fünf Werte einfügen).
//   3) `node scripts/test-r2-upload.mjs`

config({ path: process.env.R2_ENV_FILE ?? ".env.r2.local", override: true });

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_NAME;

console.log("=== Env-Vars ===");
console.log(
  "R2_ACCOUNT_ID:",
  accountId ? `${accountId.slice(0, 6)}...${accountId.slice(-4)}` : "MISSING",
);
console.log("R2_BUCKET_NAME:", bucket ?? "MISSING");
console.log(
  "R2_ACCESS_KEY_ID:",
  accessKeyId
    ? `${accessKeyId.slice(0, 4)}...${accessKeyId.slice(-4)} (length=${accessKeyId.length})`
    : "MISSING",
);
console.log(
  "R2_SECRET_ACCESS_KEY:",
  secretAccessKey
    ? `set (length=${secretAccessKey.length})`
    : "MISSING",
);

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("\n✗ Eine oder mehrere R2_*-Env-Vars fehlen. Abbruch.");
  process.exit(1);
}

const jurisdiction = process.env.R2_JURISDICTION ?? "eu";
const endpoint =
  jurisdiction === "default"
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`;
console.log("\n=== Endpoint ===");
console.log(endpoint);

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

console.log("\n=== Test 0: ListBuckets (was sieht der Token überhaupt?) ===");
try {
  const res = await client.send(new ListBucketsCommand({}));
  const names = (res.Buckets ?? []).map((b) => b.Name);
  console.log(`✓ ListBuckets OK — sichtbare Buckets: [${names.join(", ")}]`);
  if (!names.includes(bucket)) {
    console.error(
      `\n⚠ R2_BUCKET_NAME='${bucket}' ist NICHT in der Liste sichtbar.\n` +
        "  Entweder existiert der Bucket nicht oder der Token ist auf einen\n" +
        "  anderen Bucket gescoped. Vergleiche die Liste mit dem Cloudflare-\n" +
        "  Dashboard.",
    );
  }
} catch (err) {
  const e = err;
  console.error(
    `✗ ListBuckets fehlgeschlagen — ${e?.Code ?? e?.name}: ${e?.message ?? "(no message)"}`,
  );
  console.error("  $metadata:", JSON.stringify(e?.$metadata ?? {}, null, 2));
  console.error(
    "\nWenn auch ListBuckets 403 ist, sind die Credentials selbst falsch\n" +
      "(z.B. Tippfehler im Access Key oder Secret) ODER der Token-Typ\n" +
      "unterstützt die S3-API gar nicht.",
  );
}

console.log("\n=== Test 1: HeadBucket (kann der Token den Bucket sehen?) ===");
try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`✓ HeadBucket auf '${bucket}' OK`);
} catch (err) {
  const e = err;
  console.error(
    `✗ HeadBucket fehlgeschlagen — ${e?.Code ?? e?.name}: ${e?.message}`,
  );
  console.error(
    "  $metadata:",
    JSON.stringify(e?.$metadata ?? {}, null, 2),
  );
  console.error(
    "\nMögliche Ursachen:\n" +
      "  - R2_BUCKET_NAME stimmt nicht mit dem im Cloudflare-Dashboard überein\n" +
      "  - Token ist auf einen anderen Bucket gescoped\n" +
      "  - Bucket existiert nicht im Account ${accountId.slice(0,6)}…",
  );
  process.exit(1);
}

console.log("\n=== Test 2: PutObject (kann der Token schreiben?) ===");
const key = `__diagnose__/${Date.now()}-test.txt`;
try {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from("r2-test", "utf8"),
      ContentType: "text/plain",
    }),
  );
  console.log(`✓ PutObject auf '${bucket}/${key}' OK`);
  console.log(
    "\n=== Alle Tests bestanden — R2-Setup ist OK ===\n" +
      "Wenn die App weiterhin 'Access Denied' wirft, liegt's an einer\n" +
      "anderen Ursache (z.B. Vercel-Env-Vars wurden nicht zur Build-Zeit\n" +
      "geladen — neuer Deploy auf staging triggern).",
  );
} catch (err) {
  const e = err;
  console.error(
    `✗ PutObject fehlgeschlagen — ${e?.Code ?? e?.name}: ${e?.message}`,
  );
  console.error(
    "  $metadata:",
    JSON.stringify(e?.$metadata ?? {}, null, 2),
  );
  console.error(
    "\nDer Token kann den Bucket sehen aber nicht schreiben.\n" +
      "Mögliche Ursachen:\n" +
      "  - Token-Permission ist 'Object Read' statt 'Object Read & Write'\n" +
      "  - Bucket ist read-only via Bucket-Sperrregeln",
  );
  process.exit(1);
}

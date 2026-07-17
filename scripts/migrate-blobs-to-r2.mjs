#!/usr/bin/env node
// Migration: Vercel-Blob-Bestand → Cloudflare R2 (Datenschutz-Audit P1-2).
//
// Neue Uploads landen seit dem R2-Umstieg als Object-Key im privaten
// EU-Bucket (src/lib/storage.ts). Der Alt-Bestand aus der Vercel-Blob-Zeit
// (Coach-/Teilnehmer-Signaturen, Branding-Logos) liegt aber weiterhin auf
// PUBLIC URLs (`access: "public"`, Schutz nur durch Random-Suffix). Dieses
// Skript verschiebt ihn:
//
//   1. Scannt alle DB-Spalten mit Storage-Werten nach vollständigen
//      `https://…public.blob.vercel-storage.com/…`-URLs.
//   2. Dedupliziert (signatures.signature_url ist ein SNAPSHOT von
//      users./participants.signature_url — dieselbe URL steht in mehreren
//      Zeilen/Tabellen und wird nur EINMAL kopiert).
//   3. Lädt jede Datei herunter und nach R2 hoch. Der R2-Key ist der
//      Pfad der Blob-URL (`signatures/<owner>/…`, `branding/<owner>/…`) —
//      dasselbe Key-Schema wie storage.ts für neue Uploads.
//   4. Ersetzt den DB-Wert in ALLEN referenzierenden Zeilen durch den Key
//      (resolveAssetUrl() signiert Keys beim Render, URLs bleiben URLs —
//      jeder Zwischenstand ist damit funktionsfähig).
//   5. Löscht den Vercel-Blob — NUR mit explizitem `--delete-blobs`.
//
// IDEMPOTENT: bereits migrierte Werte sind Keys (keine URLs) und matchen
// den Scan nicht mehr. Ein abgebrochener Lauf kann gefahrlos wiederholt
// werden — ein erneuter Upload auf denselben Key überschreibt identisch.
//
// SICHERHEITSGUARDS:
//   * Default ist DRY-RUN (nur Scan + Plan, keine Writes). Erst `--execute`
//     schreibt — und verlangt zusätzlich `STAGING_OK=1`.
//   * Production-Erkennung wie scripts/seed-staging.mjs: existiert ein
//     Bildungsträger-Account OHNE `@signflow-staging.test`-Suffix, gilt die
//     DB als PRODUCTION → `--execute` verlangt zusätzlich `PROD_OK=1`.
//     Vor einem Prod-Lauf: DB-BACKUP ZIEHEN (docs/backups.md) + User-OK!
//   * `--delete-blobs` ist bewusst vom Migrieren getrennt: Staging und
//     Production teilen sich denselben Vercel-Blob-Store UND denselben
//     R2-Bucket. Wurde die Staging-DB je aus Prod geklont, zeigen beide
//     auf dieselben Blobs — eine Löschung im Staging-Lauf würde dann
//     Prod-Referenzen zerstören. Blobs deshalb erst im Prod-Lauf (bzw.
//     danach) löschen.
//
// ENV (R2-Vars existieren nur in Vercel Preview/Production, nicht in
// Development — lokal via `vercel env pull` beschaffen):
//
//   # Staging-Lauf (DATABASE_URL=staging kommt über --git-branch staging mit):
//   vercel env pull .env.blob-migration --environment=preview --git-branch staging
//   ENV_FILE=.env.blob-migration node scripts/migrate-blobs-to-r2.mjs            # Dry-Run
//   STAGING_OK=1 ENV_FILE=.env.blob-migration node scripts/migrate-blobs-to-r2.mjs --execute
//
//   # Prod-Lauf (NUR nach Staging-Verifikation + Backup + explizitem User-OK):
//   vercel env pull .env.blob-migration-prod --environment=production
//   ENV_FILE=.env.blob-migration-prod node scripts/migrate-blobs-to-r2.mjs       # Dry-Run
//   STAGING_OK=1 PROD_OK=1 ENV_FILE=.env.blob-migration-prod \
//     node scripts/migrate-blobs-to-r2.mjs --execute --delete-blobs
//
//   Benötigt: DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
//   R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME (+ optional R2_JURISDICTION,
//   Default "eu" wie storage.ts); für --delete-blobs: BLOB_READ_WRITE_TOKEN.

import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { del as vercelBlobDel } from "@vercel/blob";
import ws from "ws";

// override: false — shell-gesetzte Vars gewinnen über die Env-Datei
// (Konvention wie scripts/apply-*-migration.mjs).
config({ path: process.env.ENV_FILE ?? ".env.local", override: false });

const EXECUTE = process.argv.includes("--execute");
const DELETE_BLOBS = process.argv.includes("--delete-blobs");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
if (EXECUTE && process.env.STAGING_OK !== "1") {
  console.error(
    "Refuse: --execute requires explicit STAGING_OK=1. This script rewrites storage references.",
  );
  process.exit(1);
}
if (DELETE_BLOBS && !EXECUTE) {
  console.error("Refuse: --delete-blobs only makes sense with --execute.");
  process.exit(1);
}
if (DELETE_BLOBS && !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("Refuse: --delete-blobs requires BLOB_READ_WRITE_TOKEN.");
  process.exit(1);
}

if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

const dbHint = process.env.DATABASE_URL.replace(/:[^@]+@/, ":<pw>@");
console.log("DATABASE_URL =", dbHint);
console.log(
  "Mode:",
  EXECUTE ? "EXECUTE" : "DRY-RUN",
  DELETE_BLOBS ? "+ delete-blobs" : "(blobs bleiben erhalten)",
  "\n",
);

// Gleiche Erkennung wie storage.ts isVercelBlobUrl(); SQL-Seite s.u.
const BLOB_URL_RE = /^https?:\/\/[^/]*\.public\.blob\.vercel-storage\.com\//;

// Alle DB-Spalten, die Storage-Werte (Key oder URL) tragen können.
// final_documents.pdf_url hält App-relative API-URLs (kein Blob-Storage)
// und bleibt deshalb außen vor. users.image (Better-Auth-Feld) wird nie
// von der App beschrieben — der Scan nimmt es als Sicherheitsnetz trotzdem mit.
const TARGETS = [
  { table: "users", column: "signature_url" },
  { table: "users", column: "pdf_logo_url" },
  { table: "users", column: "image" },
  { table: "participants", column: "signature_url" },
  { table: "signatures", column: "signature_url" },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

let exitCode = 0;
try {
  // --- Production-Erkennung (wie scripts/seed-staging.mjs) ---
  const { rows: bts } = await client.query(
    `SELECT email FROM users WHERE role = 'bildungstraeger' AND deleted_at IS NULL`,
  );
  const nonStagingBts = bts.filter(
    (r) => !String(r.email).endsWith("@signflow-staging.test"),
  );
  const looksLikeProd = nonStagingBts.length > 0;
  if (looksLikeProd) {
    console.log(
      `⚠ DB sieht nach PRODUCTION aus (${nonStagingBts.length} Bildungsträger ohne Staging-Suffix).`,
    );
    if (EXECUTE && process.env.PROD_OK !== "1") {
      console.error(
        "Refuse: --execute gegen Production verlangt zusätzlich PROD_OK=1.",
      );
      console.error(
        "Vorher: DB-Backup ziehen (docs/backups.md) + explizites User-OK einholen!",
      );
      process.exit(1);
    }
  } else {
    console.log("✓ DB sieht nach Staging aus (nur Staging-Bildungsträger).");
  }
  console.log();

  // --- Scan: alle Blob-URLs + ihre Referenzen einsammeln ---
  /** @type {Map<string, Array<{table: string, column: string, count: number}>>} */
  const refsByUrl = new Map();
  for (const { table, column } of TARGETS) {
    const { rows } = await client.query(
      `SELECT ${column} AS url, count(*)::int AS count
         FROM ${table}
        WHERE ${column} LIKE 'http%'
          AND ${column} ~ '^https?://[^/]*\\.public\\.blob\\.vercel-storage\\.com/'
        GROUP BY ${column}`,
    );
    for (const { url, count } of rows) {
      if (!BLOB_URL_RE.test(url)) continue; // Belt-and-suspenders zur SQL-Regex
      if (!refsByUrl.has(url)) refsByUrl.set(url, []);
      refsByUrl.get(url).push({ table, column, count });
    }
    // Diagnose: absolute Nicht-Blob-URLs (sollten nicht existieren) melden.
    const { rows: others } = await client.query(
      `SELECT count(*)::int AS count FROM ${table}
        WHERE ${column} LIKE 'http%'
          AND ${column} !~ '^https?://[^/]*\\.public\\.blob\\.vercel-storage\\.com/'`,
    );
    const otherCount = others[0]?.count ?? 0;
    if (otherCount > 0) {
      console.log(
        `ℹ ${table}.${column}: ${otherCount} absolute URL(s), die KEINE Vercel-Blob-URLs sind — bleiben unangetastet.`,
      );
    }
  }

  const urls = [...refsByUrl.keys()].sort();
  const totalRefs = [...refsByUrl.values()]
    .flat()
    .reduce((sum, r) => sum + r.count, 0);
  console.log(
    `Scan: ${urls.length} eindeutige Vercel-Blob-URL(s) in ${totalRefs} Zeile(n).\n`,
  );
  if (urls.length === 0) {
    console.log("✓ Nichts zu migrieren.");
    process.exit(0);
  }

  const r2 = makeR2Client();

  const results = { migrated: 0, deleted: 0, missing: [], failed: [] };
  for (const url of urls) {
    const key = r2KeyForUrl(url);
    const refs = refsByUrl.get(url);
    const refSummary = refs
      .map((r) => `${r.table}.${r.column}×${r.count}`)
      .join(", ");
    console.log(`• ${url}`);
    console.log(`  → r2:${key}  [${refSummary}]`);

    if (!EXECUTE) continue;

    // 1) Download (Blob-URLs sind public — kein Token nötig).
    const res = await fetch(url);
    if (res.status === 404) {
      // Verwaiste Referenz (Blob wurde z.B. beim Signatur-Neuanlegen schon
      // gelöscht). DB-Wert bewusst NICHT anfassen — nur melden.
      console.log("  ✗ 404 — Blob existiert nicht mehr, Referenz bleibt unverändert.");
      results.missing.push(url);
      continue;
    }
    if (!res.ok) {
      console.log(`  ✗ Download fehlgeschlagen (HTTP ${res.status}) — übersprungen.`);
      results.failed.push(url);
      continue;
    }
    const body = Buffer.from(await res.arrayBuffer());
    const contentType =
      res.headers.get("content-type") ?? contentTypeForKey(key);

    // 2) Upload nach R2 (deterministischer Key → Wiederholung überschreibt identisch).
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    // 3) Alle DB-Referenzen auf den Key umstellen (ein UPDATE pro
    //    Tabelle×Spalte erwischt sämtliche Zeilen inkl. Snapshots).
    for (const { table, column } of refs) {
      const { rowCount } = await client.query(
        `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
        [key, url],
      );
      console.log(`  ✓ ${table}.${column}: ${rowCount} Zeile(n) → Key`);
    }
    results.migrated++;

    // 4) Vercel-Blob löschen — erst NACHDEM alle Referenzen umgestellt sind.
    if (DELETE_BLOBS) {
      await vercelBlobDel(url);
      results.deleted++;
      console.log("  ✓ Vercel-Blob gelöscht");
    }
  }

  console.log();
  if (!EXECUTE) {
    console.log(
      `DRY-RUN beendet — ${urls.length} URL(s) würden migriert. Ausführen mit --execute.`,
    );
  } else {
    // Verifikation: erneuter Scan muss (bis auf Missing/Failed) leer sein.
    let remaining = 0;
    for (const { table, column } of TARGETS) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS count FROM ${table}
          WHERE ${column} ~ '^https?://[^/]*\\.public\\.blob\\.vercel-storage\\.com/'`,
      );
      remaining += rows[0]?.count ?? 0;
    }
    console.log(
      `✓ ${results.migrated} URL(s) migriert` +
        (DELETE_BLOBS ? `, ${results.deleted} Blob(s) gelöscht` : ", Blobs erhalten (--delete-blobs für Löschung)") +
        `. Verbleibende Blob-Referenzen in der DB: ${remaining}.`,
    );
    if (results.missing.length > 0) {
      console.log(
        `⚠ ${results.missing.length} verwaiste Referenz(en) (Blob 404, DB-Wert unverändert):`,
      );
      for (const u of results.missing) console.log(`   - ${u}`);
    }
    if (results.failed.length > 0) {
      exitCode = 1;
      console.log(`✗ ${results.failed.length} Download-Fehler — Lauf wiederholen:`);
      for (const u of results.failed) console.log(`   - ${u}`);
    }
  }
} finally {
  client.release();
  await pool.end();
}
process.exit(exitCode);

// --- Helpers ---

// R2-Client wie src/lib/storage.ts (inkl. EU-jurisdiction-Endpoint).
function makeR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    if (!EXECUTE) {
      // Dry-Run braucht kein R2 — Scan + Plan funktionieren ohne Creds.
      return { client: null, bucket: null };
    }
    console.error(
      "R2 credentials missing (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET_NAME).",
    );
    console.error(
      "Lokal beschaffen: vercel env pull <datei> --environment=preview  (siehe Skript-Header).",
    );
    process.exit(1);
  }
  const jurisdiction = process.env.R2_JURISDICTION ?? "eu";
  const endpoint =
    jurisdiction === "default"
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`;
  return {
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
}

// R2-Key = Pfad der Blob-URL. Uploads liefen schon zur Vercel-Blob-Zeit über
// dieselben Pfade (`signatures/<owner>/<ts>-<rand>.png`, `branding/<owner>/…`,
// storage.ts) — der URL-Pfad trägt also bereits das Ziel-Key-Schema.
// Unerwartete Pfade landen unter `migrated/` statt den Lauf abzubrechen.
function r2KeyForUrl(url) {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const key = pathname.replace(/^\/+/, "");
  if (/^(signatures|branding)\//.test(key)) return key;
  return `migrated/${key}`;
}

function contentTypeForKey(key) {
  const ext = key.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

// Migration: PDF-Branding (Logo + Adresse) auf der users-Tabelle.
// Im aktuellen Single-Tenant-Setup nur auf der bildungstraeger-User-Zeile
// gesetzt; Coaches lesen die Werte beim BER-Export. Wandert mit dem
// Multi-Tenant-Schema (committed 2026-04-28) auf die spätere Org-Tabelle.
// Rein additiv, idempotent.
const statements = [
  `ALTER TABLE users
     ADD COLUMN IF NOT EXISTS pdf_logo_url text`,
  `ALTER TABLE users
     ADD COLUMN IF NOT EXISTS pdf_address text`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  console.log("\n✓ users.pdf_logo_url + users.pdf_address hinzugefügt");
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}

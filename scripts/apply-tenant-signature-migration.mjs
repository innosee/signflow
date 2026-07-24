import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: ".env.local", override: false });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const dbHint = process.env.DATABASE_URL.replace(/:[^@]+@/, ":<pw>@");
console.log("DATABASE_URL =", dbHint, "\n");

if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

// Additive, idempotente Spalte für die geteilte BT-Org-Unterschrift
// (Feature „Kunde-Dokumente", BT-Rollen-Umbau). Kein Backfill nötig — NULL
// bedeutet „noch nicht gesetzt".
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  console.log("→ ALTER TABLE tenants ADD COLUMN IF NOT EXISTS signature_url text");
  await client.query(
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS signature_url text`,
  );
  const { rows } = await client.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = 'tenants' AND column_name = 'signature_url'`,
  );
  if (rows.length === 0) {
    throw new Error("signature_url-Spalte nach Migration nicht vorhanden");
  }
  console.log(
    `\n✓ tenants.signature_url vorhanden (${rows[0].data_type})`,
  );
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}

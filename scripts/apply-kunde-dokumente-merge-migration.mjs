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

// ALTER TYPE ... ADD VALUE kann nicht in einer Transaction laufen — einzeln.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  console.log("→ ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'tnv_ds_merge'");
  await client.query(
    `ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'tnv_ds_merge'`,
  );
  const { rows } = await client.query(
    `SELECT enumlabel FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'document_type' ORDER BY e.enumsortorder`,
  );
  console.log(
    `\n✓ document_type-Werte: ${rows.map((r) => r.enumlabel).join(", ")}`,
  );
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}

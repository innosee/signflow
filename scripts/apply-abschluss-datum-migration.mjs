import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// override: false — sonst überschreibt .env.local einen aus der Shell
// gesetzten DATABASE_URL und die Migration landet auf der falschen DB
// (siehe Memory project_neonctl_permission).
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

// Abschlussdatum des BER (= Datum des letzten Termins, überschreibbar).
// Additiv + idempotent. Muss VOR dem Deploy laufen — der BER-Editor + das
// Print-Dokument lesen abschlussberichte.abschluss_datum.
const statements = [
  `ALTER TABLE abschlussberichte
     ADD COLUMN IF NOT EXISTS abschluss_datum date`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  const [{ col }] = (
    await client.query(
      `SELECT count(*)::int AS col
         FROM information_schema.columns
        WHERE table_name = 'abschlussberichte'
          AND column_name = 'abschluss_datum'`,
    )
  ).rows;
  console.log(`\n✔ Migration ok — abschluss_datum vorhanden: ${col === 1}`);
} finally {
  client.release();
  await pool.end();
}

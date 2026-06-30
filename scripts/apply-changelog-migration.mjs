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

// Produkt-Changelog (Phase 1). Additiv + idempotent. Muss VOR dem Deploy
// laufen — die Layouts lesen changelog_entries + users.changelog_last_seen_at
// bei jedem Request.
const statements = [
  `ALTER TABLE users
     ADD COLUMN IF NOT EXISTS changelog_last_seen_at timestamptz`,
  `CREATE TABLE IF NOT EXISTS changelog_entries (
     id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     title        text NOT NULL,
     body         text NOT NULL,
     published_at timestamptz NOT NULL DEFAULT now(),
     created_at   timestamptz NOT NULL DEFAULT now(),
     updated_at   timestamptz NOT NULL DEFAULT now(),
     deleted_at   timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS changelog_entries_published_idx
     ON changelog_entries (published_at DESC)`,
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
        WHERE table_name = 'users'
          AND column_name = 'changelog_last_seen_at'`,
    )
  ).rows;
  const [{ entries }] = (
    await client.query(
      `SELECT count(*)::int AS entries FROM changelog_entries`,
    )
  ).rows;
  console.log(
    `\n✓ Changelog-Migration angewendet` +
      `\n  users.changelog_last_seen_at vorhanden: ${col === 1 ? "ja" : "NEIN"}` +
      `\n  changelog_entries Zeilen: ${entries}`,
  );
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}

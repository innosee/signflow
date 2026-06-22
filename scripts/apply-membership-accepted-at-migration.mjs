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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  // Idempotenz: Backfill nur, wenn die Spalte VOR diesem Lauf noch nicht
  // existierte. Sonst würde ein erneuter Lauf alle offenen Einladungen
  // (accepted_at IS NULL) fälschlich als angenommen markieren.
  const existed =
    (
      await client.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tenant_memberships' AND column_name = 'accepted_at'`,
      )
    ).rowCount > 0;

  console.log("→ ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS accepted_at");
  await client.query(
    `ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS accepted_at timestamptz`,
  );

  if (!existed) {
    console.log("→ Backfill: accepted_at = created_at für alle bestehenden Zeilen");
    await client.query(
      `UPDATE tenant_memberships SET accepted_at = created_at WHERE accepted_at IS NULL`,
    );
  } else {
    console.log("→ Spalte existierte bereits — Backfill übersprungen (idempotent)");
  }

  const [{ accepted, pending }] = (
    await client.query(
      `SELECT
         count(*) FILTER (WHERE accepted_at IS NOT NULL AND deleted_at IS NULL)::int AS accepted,
         count(*) FILTER (WHERE accepted_at IS NULL AND deleted_at IS NULL)::int AS pending
       FROM tenant_memberships`,
    )
  ).rows;
  console.log(
    `\n✓ accepted_at angelegt — ${accepted} angenommene, ${pending} offene Einladung(en)`,
  );
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}

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

// Migration: Abschluss-Differenzierung. Trennt „UE-Unterschreitung" von
// „zeitlich vorzeitigem Ende". Neue Spalte flag_ue_unterschritten; Backfill
// aus der alten (UE-basierten) Bedeutung von flag_vorzeitiges_ende.
// Additiv + idempotent.
const statements = [
  `ALTER TABLE courses ADD COLUMN IF NOT EXISTS flag_ue_unterschritten boolean NOT NULL DEFAULT false`,
  // Alt-Semantik retten: bisheriges flag_vorzeitiges_ende = UE-Unterschreitung.
  `UPDATE courses SET flag_ue_unterschritten = true
     WHERE flag_vorzeitiges_ende = true AND flag_ue_unterschritten = false`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  const [{ total, ueUnter, vorzeitig }] = (
    await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE flag_ue_unterschritten)::int AS "ueUnter",
              count(*) FILTER (WHERE flag_vorzeitiges_ende)::int   AS "vorzeitig"
       FROM courses
       WHERE deleted_at IS NULL`,
    )
  ).rows;
  console.log(
    `\n✓ courses.flag_ue_unterschritten angelegt + Backfill` +
      `\n  Kurse: ${total} (${ueUnter} UE-unterschritten, ${vorzeitig} zeitlich vorzeitig)`,
  );
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}

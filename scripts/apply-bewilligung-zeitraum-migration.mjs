import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readFileSync } from "node:fs";

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

// Migration: Bewilligung nach Maßnahmenzeitraum. Rein additiv + idempotent;
// die Defaults halten Bestandskurse und -Träger exakt beim heutigen Verhalten.
const sql = readFileSync(
  new URL("../drizzle/manual/2026-09-23-bewilligung-nach-zeitraum.sql", import.meta.url),
  "utf8",
);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query(sql);
  const { rows: courses } = await client.query(
    `SELECT bewilligungsbasis, count(*)::int AS n
       FROM courses WHERE deleted_at IS NULL GROUP BY bewilligungsbasis`,
  );
  const { rows: tenants } = await client.query(
    `SELECT name, bewilligung_zeitraum_enabled, zert_max_ue, zert_max_wochen
       FROM tenants WHERE deleted_at IS NULL ORDER BY name`,
  );
  console.log("✓ Migration angewendet.\n");
  console.log("Kurse je Bewilligungsbasis:");
  for (const r of courses) console.log(`  ${r.bewilligungsbasis}: ${r.n}`);
  console.log("\nTräger-Einstellungen:");
  for (const t of tenants) {
    console.log(
      `  ${t.name}: Option ${t.bewilligung_zeitraum_enabled ? "AN" : "aus"}, ` +
        `max ${t.zert_max_ue} UE / ${t.zert_max_wochen} Wochen`,
    );
  }
} finally {
  client.release();
  await pool.end();
}

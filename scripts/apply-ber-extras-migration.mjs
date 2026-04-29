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

// Migration: drei zusätzliche BER-Felder.
// - keine_fehlzeiten: Checkbox im Bericht ("Teilnehmer hatte keine Fehlzeiten")
// - sonstiges: optionales Freitextfeld für AVGS-Inhalte (GEPEDU-Test, Anerkennung
//   ausländischer Diplome, Tragfähigkeitsanalyse, …) — wird NICHT durch den
//   Checker gepruft, ist also kein Checker-Section.
// - must_have_override_reason: wenn ein Coach für eine sehr kurze AVGS (z.B. 5 UE
//   "Bewerbungsunterlagen optimieren") nicht alle Pflicht-Bausteine bedienen
//   kann, trägt er hier eine kurze Begründung ein. Die fehlenden mustHaves
//   werden dann zu Soft-Flags, der Submit-Gate öffnet sich. NULL = kein Override.
//
// Rein additiv, idempotent. Bestehende Submit-Invariante
// (`abschlussberichte_submit_invariants`) bleibt unangetastet — `lastCheckPassed`
// muss weiterhin true sein, was wir bei Override im Application-Code erzwingen.
const statements = [
  `ALTER TABLE abschlussberichte
     ADD COLUMN IF NOT EXISTS keine_fehlzeiten boolean NOT NULL DEFAULT false`,
  `ALTER TABLE abschlussberichte
     ADD COLUMN IF NOT EXISTS sonstiges text NOT NULL DEFAULT ''`,
  `ALTER TABLE abschlussberichte
     ADD COLUMN IF NOT EXISTS must_have_override_reason text`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  console.log(
    "\n✓ keine_fehlzeiten, sonstiges, must_have_override_reason hinzugefügt",
  );
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}

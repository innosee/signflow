// Schema-Migration: krankheitsbedingt abgesagter Termin (0 UE, keine Signatur).
//
// Fügt sessions.abgesagt (boolean, default false) hinzu und erweitert den
// CHECK `sessions_erstgespraech_consistency` um einen dritten Zweig:
//   - Erstgespräch:  is_erstgespraech=true,  ue=0,  geeignet NOT NULL, abgesagt=false
//   - reguläre Sess: is_erstgespraech=false, ue>0,  geeignet NULL,     abgesagt=false
//   - abgesagt:      is_erstgespraech=false, ue=0,  geeignet NULL,     abgesagt=true
//
// Idempotent: ADD COLUMN IF NOT EXISTS; Constraint wird gedroppt + neu gesetzt.
//
// Nutzung:
//   DATABASE_URL="<neon>" MIGRATE_OK=1 node scripts/apply-abgesagt-migration.mjs
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
if (process.env.MIGRATE_OK !== "1") {
  console.error("Refuse: MIGRATE_OK=1 must be set explicitly (this changes schema).");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
try {
  await c.query(
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS abgesagt boolean NOT NULL DEFAULT false`,
  );
  console.log("→ Spalte sessions.abgesagt sichergestellt.");

  await c.query(
    `ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_erstgespraech_consistency`,
  );
  await c.query(
    `ALTER TABLE sessions ADD CONSTRAINT sessions_erstgespraech_consistency CHECK (
       (is_erstgespraech = true  AND anzahl_ue = 0 AND geeignet IS NOT NULL AND abgesagt = false)
       OR (is_erstgespraech = false AND abgesagt = false AND anzahl_ue > 0 AND geeignet IS NULL)
       OR (is_erstgespraech = false AND abgesagt = true  AND anzahl_ue = 0 AND geeignet IS NULL)
     )`,
  );
  console.log("✅ CHECK sessions_erstgespraech_consistency erneuert (inkl. abgesagt-Zweig).");

  const info = await c.query(
    `SELECT count(*)::int n FROM sessions WHERE abgesagt = true`,
  );
  console.log(`Bestehende abgesagte Sessions: ${info.rows[0].n}`);
} finally {
  c.release();
  await pool.end();
}

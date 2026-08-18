// Daten-Migration: ESC-Kurstitel „Standort-Coaching" → „systemisches Coaching".
//
// Hintergrund: `courses.title` wird beim Anlegen als Snapshot aus
// MASSNAHME_TYP_LABEL befüllt (src/lib/massnahme-typ.ts). Das ESC-Label wurde
// auf „ESC — systemisches Coaching" geändert; bestehende ESC-Kurse tragen aber
// noch den alten Titel und müssen einmalig nachgezogen werden.
//
// SICHER: Aktualisiert NUR Kurse mit massnahme_typ='ESC' UND exakt dem alten
// Titel — etwaige abweichende Titel bleiben unberührt. Idempotent.
//
// Nutzung:
//   DATABASE_URL="<neon>" MIGRATE_OK=1 node scripts/apply-esc-label-rename.mjs
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

const OLD = "ESC — Standort-Coaching";
const NEW = "ESC — systemisches Coaching";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
if (process.env.MIGRATE_OK !== "1") {
  console.error("Refuse: MIGRATE_OK=1 must be set explicitly (this writes data).");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
try {
  const before = await c.query(
    `SELECT count(*)::int n FROM courses WHERE massnahme_typ='ESC' AND title=$1`,
    [OLD],
  );
  console.log(`→ ${before.rows[0].n} ESC-Kurse mit altem Titel gefunden.`);
  if (before.rows[0].n === 0) {
    console.log("Nichts zu tun.");
  } else {
    const res = await c.query(
      `UPDATE courses SET title=$1, updated_at=now()
       WHERE massnahme_typ='ESC' AND title=$2`,
      [NEW, OLD],
    );
    console.log(`✅ ${res.rowCount} Kurstitel aktualisiert → "${NEW}".`);
  }
  const remaining = await c.query(
    `SELECT count(*)::int n FROM courses WHERE massnahme_typ='ESC' AND title=$1`,
    [OLD],
  );
  console.log(`Verbleibend mit altem Titel: ${remaining.rows[0].n}`);
} finally {
  c.release();
  await pool.end();
}

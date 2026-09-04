#!/usr/bin/env node
// ADDITIVES Staging-Seed für „geleistete statt bewilligte UE" (BER + TNB).
//
// Legt einen zusätzlichen TEST-Kunden an, dessen Maßnahme vorzeitig endete:
// 80 bewilligte UE, aber nur 17 tatsächlich geleistete. Dazu einen bereits
// EINGEREICHTEN Abschlussbericht mit dem alten `tn_ue='80'`-Snapshot (zeigt,
// dass Alt-Berichte sich selbst korrigieren) und eine Teilnahmebescheinigung
// als Entwurf.
//
// Löscht NICHTS — bestehende Staging-Daten bleiben unangetastet. Alle
// erzeugten Datensätze tragen das Präfix „TEST-UE".
//
// Nutzung:
//   DATABASE_URL=$(npx neonctl connection-string br-long-pond-alx2tzly \
//     --project-id solitary-waterfall-77539790 --pooled --database-name neondb | tail -1) \
//   STAGING_OK=1 node scripts/seed-staging-geleistete-ue.mjs

import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
if (process.env.STAGING_OK !== "1") {
  console.error("Refuse: STAGING_OK=1 must be explicitly set.");
  process.exit(1);
}
if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const host = new URL(process.env.DATABASE_URL.replace(/^postgres/, "http"))
  .hostname;
console.log(`→ DB-Host: ${host.replace(/^(.{18}).*/, "$1…")}`);

// Refuse-Guard: nur auf einer Datenbank laufen, in der ALLE Bildungsträger das
// Staging-Suffix tragen. Auf Prod bricht das Skript hier ab.
const { rows: bts } = await client.query(
  `SELECT email FROM users WHERE role = 'bildungstraeger' AND deleted_at IS NULL`,
);
const nonStaging = bts.filter(
  (r) => !String(r.email).endsWith("@signflow-staging.test"),
);
if (nonStaging.length > 0) {
  console.error(
    "Refuse: Nicht-Staging-Bildungsträger gefunden:",
    nonStaging.map((r) => r.email).join(", "),
  );
  client.release();
  await pool.end();
  process.exit(1);
}

const { rows: coachRows } = await client.query(
  `SELECT id, tenant_id FROM users
    WHERE email = 'coach.alpha@signflow-staging.test' AND deleted_at IS NULL
    LIMIT 1`,
);
if (!coachRows[0]) {
  console.error(
    "Refuse: coach.alpha@signflow-staging.test fehlt — erst scripts/seed-staging.mjs laufen lassen.",
  );
  client.release();
  await pool.end();
  process.exit(1);
}
const coachId = coachRows[0].id;
const tenantId = coachRows[0].tenant_id;

const { rows: bedRows } = await client.query(
  `SELECT id FROM bedarfstraeger WHERE tenant_id = $1::uuid AND deleted_at IS NULL LIMIT 1`,
  [tenantId],
);
if (!bedRows[0]) {
  console.error("Refuse: kein Bedarfsträger im Staging-Tenant.");
  client.release();
  await pool.end();
  process.exit(1);
}
const bedarfstraegerId = bedRows[0].id;

const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");

console.log("→ Teilnehmer + Kurs (80 bewilligte UE, vorzeitig beendet)");
const { rows: tnRows } = await client.query(
  `INSERT INTO participants (tenant_id, name, email, kunden_nr)
     VALUES ($1::uuid, 'TEST-UE Vorzeitig', $2, $3)
   RETURNING id`,
  [
    tenantId,
    `test-ue-${stamp}@signflow-staging.test`,
    `999UE${stamp.slice(0, 5)}`,
  ],
);
const participantId = tnRows[0].id;

const { rows: courseRows } = await client.query(
  `INSERT INTO courses (
     coach_id, participant_id, title, avgs_nummer, durchfuehrungsort,
     anzahl_bewilligte_ue, bedarfstraeger_id, massnahme_typ,
     avgs_gueltig_von, avgs_gueltig_bis, start_date, end_date, status
   ) VALUES (
     $1, $2, 'TEST-UE erango systemische Stabilisierung während der Probezeit (ESCA)',
     'TEST-UE 863/38/25', 'Online', 80, $3, 'ESCA',
     '2026-07-01', '2026-12-31', '2026-07-29', '2026-11-16', 'active'
   ) RETURNING id`,
  [coachId, participantId, bedarfstraegerId],
);
const courseId = courseRows[0].id;

console.log("→ 9 Termine: Erstgespräch (0 UE) + 8 × zusammen 17 UE, alle signiert");
// Erstgespräch zählt per DB-CHECK 0 UE, die acht regulären Termine summieren
// sich auf genau 17 UE — der Fall aus dem Nutzer-Feedback (17 statt 80).
const regulaere = [
  ["2026-07-30", "2"],
  ["2026-08-04", "2"],
  ["2026-08-06", "2"],
  ["2026-08-11", "2"],
  ["2026-08-13", "2"],
  ["2026-08-18", "2"],
  ["2026-08-20", "2"],
  ["2026-08-27", "3"],
];
await client.query(
  `INSERT INTO sessions (
     course_id, coach_id, session_date, topic, anzahl_ue, modus,
     is_erstgespraech, geeignet, status
   ) VALUES ($1, $2, '2026-07-29', 'Erstgespräch und Eignungsanalyse', 0, 'online', true, true, 'completed')`,
  [courseId, coachId],
);
for (const [datum, ue] of regulaere) {
  await client.query(
    `INSERT INTO sessions (
       course_id, coach_id, session_date, topic, anzahl_ue, modus,
       is_erstgespraech, status
     ) VALUES ($1, $2, $3, 'Selbstreflexion, Krisenintervention, Handlungsperspektiven', $4, 'online', false, 'completed')`,
    [courseId, coachId, datum, ue],
  );
}

console.log("→ eingereichter BER mit ALTEM Snapshot tn_ue='80'");
await client.query(
  `INSERT INTO abschlussberichte (
     course_id, participant_id, coach_id,
     teilnahme, ablauf, fazit, sonstiges, keine_fehlzeiten,
     tn_vorname, tn_nachname, tn_kunden_nr, tn_avgs_nummer, tn_zeitraum, tn_ue,
     coach_name_snapshot, abschluss_datum,
     status, last_check_passed, submitted_at
   ) VALUES (
     $1, $2, $3,
     'TEST-UE: Die Teilnehmerin war durchgehend zuverlässig und brachte sich aktiv in die Termine ein. Reflexionsbereitschaft und Eigeninitiative waren deutlich erkennbar.',
     'TEST-UE: Über acht Termine wurden Selbstreflexion, Krisenintervention und Handlungsperspektiven bearbeitet. Die Maßnahme endete vorzeitig nach 17 von 80 bewilligten UE.',
     'TEST-UE: Die Stabilisierung während der Probezeit ist gelungen; das Coaching konnte vorzeitig beendet werden.',
     '', true,
     'TEST-UE', 'Vorzeitig', $4, 'TEST-UE 863/38/25', '29.07.2026 — 27.08.2026', '80',
     'Coach Alpha', '2026-08-27',
     'submitted', true, NOW()
   )`,
  [courseId, participantId, coachId, `999UE${stamp.slice(0, 5)}`],
);

console.log("→ Teilnahmebescheinigung (Entwurf)");
await client.query(
  `INSERT INTO documents (course_id, participant_id, type, status, form_data, created_by)
     VALUES ($1, $2, 'tnb_cert', 'draft', $3::jsonb, $4)`,
  [
    courseId,
    participantId,
    JSON.stringify({ selectedKeys: "[]", customLines: "[]" }),
    coachId,
  ],
);

client.release();
await pool.end();

console.log(
  `\n✓ Fertig.\n` +
    `   Kunde:  TEST-UE Vorzeitig\n` +
    `   Kurs:   /coach/courses/${courseId}\n` +
    `   80 bewilligte UE, 17 geleistete UE\n` +
    `   BER (eingereicht, Snapshot 80) + TNB-Entwurf liegen bereit.\n`,
);

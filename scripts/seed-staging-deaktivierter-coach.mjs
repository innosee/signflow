#!/usr/bin/env node
// ADDITIVES Staging-Seed für „deaktivierter Coach blockiert den Kunden".
//
// Baut den Prod-Fall nach (Kunde „Hermina Laktos", 09/2026): ein Kunde, in
// dessen Kompetenzteam ein inzwischen DEAKTIVIERTER Coach hängt. Vor dem Fix
// war der im Multiselect unsichtbar, wurde aber mitgesendet — der Kunde ließ
// sich dadurch überhaupt nicht mehr speichern.
//
// Legt außerdem die fehlenden `tenant_memberships` für die Staging-Coaches an:
// die Coach-Auswahl ist membership-basiert und auf Staging sonst LEER (das
// Seed-Skript stammt noch aus der Zeit vor dem Membership-Modell).
//
// Löscht NICHTS. Alle erzeugten Datensätze tragen das Präfix „TEST-DEAKT".
//
// Nutzung:
//   DATABASE_URL=$(npx neonctl connection-string br-long-pond-alx2tzly \
//     --project-id solitary-waterfall-77539790 --org-id org-flat-haze-22361689 \
//     --pooled --database-name neondb | tail -1) \
//   STAGING_OK=1 node scripts/seed-staging-deaktivierter-coach.mjs

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

const fail = async (msg) => {
  console.error(msg);
  client.release();
  await pool.end();
  process.exit(1);
};

// Refuse-Guard: nur auf einer DB laufen, in der ALLE Bildungsträger das
// Staging-Suffix tragen. Auf Prod bricht das Skript hier ab.
const { rows: bts } = await client.query(
  `SELECT email FROM users WHERE role = 'bildungstraeger' AND deleted_at IS NULL`,
);
const nonStaging = bts.filter(
  (r) => !String(r.email).endsWith("@signflow-staging.test"),
);
if (nonStaging.length > 0) {
  await fail(
    `Refuse: Nicht-Staging-Bildungsträger gefunden: ${nonStaging.map((r) => r.email).join(", ")}`,
  );
}

const { rows: coachRows } = await client.query(
  `SELECT id, tenant_id FROM users
    WHERE email = 'coach.alpha@signflow-staging.test' AND deleted_at IS NULL
    LIMIT 1`,
);
if (!coachRows[0]) {
  await fail(
    "Refuse: coach.alpha@signflow-staging.test fehlt — erst scripts/seed-staging.mjs laufen lassen.",
  );
}
const coachId = coachRows[0].id;
const tenantId = coachRows[0].tenant_id;

const { rows: bedRows } = await client.query(
  `SELECT id FROM bedarfstraeger WHERE tenant_id = $1::uuid AND deleted_at IS NULL LIMIT 1`,
  [tenantId],
);
if (!bedRows[0]) await fail("Refuse: kein Bedarfsträger im Staging-Tenant.");
const bedarfstraegerId = bedRows[0].id;

// 1) Mitgliedschaften nachziehen — sonst ist die Coach-Auswahl leer.
console.log("→ tenant_memberships für vorhandene Staging-User (idempotent)");
const { rows: alle } = await client.query(
  `SELECT id, role FROM users
    WHERE email LIKE '%@signflow-staging.test' AND deleted_at IS NULL`,
);
for (const u of alle) {
  await client.query(
    `INSERT INTO tenant_memberships (user_id, tenant_id, role, accepted_at)
       SELECT $1::uuid, $2::uuid, $3, now()
       WHERE NOT EXISTS (
         SELECT 1 FROM tenant_memberships
          WHERE user_id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL
       )`,
    [u.id, tenantId, u.role],
  );
}

const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");

// 2) Deaktivierte Coachin (mit aktiver Mitgliedschaft — genau wie auf Prod).
console.log("→ deaktivierte Coachin „TEST-DEAKT Natalya Symonova\"");
const { rows: totRows } = await client.query(
  `INSERT INTO users (tenant_id, role, email, name, deleted_at)
     VALUES ($1::uuid, 'coach', $2, 'TEST-DEAKT Natalya Symonova', now())
   RETURNING id`,
  [tenantId, `test-deakt-${stamp}@signflow-staging.test`],
);
const toterCoachId = totRows[0].id;
await client.query(
  `INSERT INTO tenant_memberships (user_id, tenant_id, role, accepted_at)
     VALUES ($1::uuid, $2::uuid, 'coach', now())`,
  [toterCoachId, tenantId],
);

// 3) Kunde + Kurs, Team = aktiver Coach + deaktivierte Coachin.
console.log("→ Kunde + Kurs mit blockiertem Kompetenzteam");
const { rows: tnRows } = await client.query(
  `INSERT INTO participants (tenant_id, name, email, kunden_nr)
     VALUES ($1::uuid, 'TEST-DEAKT Hermina Laktos', $2, $3)
   RETURNING id`,
  [
    tenantId,
    `test-deakt-tn-${stamp}@signflow-staging.test`,
    `160D${stamp.slice(0, 5)}-1`,
  ],
);
const participantId = tnRows[0].id;

const { rows: courseRows } = await client.query(
  `INSERT INTO courses (
     coach_id, participant_id, title, avgs_nummer, durchfuehrungsort,
     anzahl_bewilligte_ue, bedarfstraeger_id, massnahme_typ,
     avgs_gueltig_von, avgs_gueltig_bis, start_date, end_date, status
   ) VALUES (
     $1, $2, 'TEST-DEAKT EKC — Karriere-Coaching',
     'TEST-DEAKT 863/40/25', 'Online', 40, $3, 'EKC',
     '2026-07-01', '2026-12-31', '2026-08-04', '2026-11-30', 'active'
   ) RETURNING id`,
  [coachId, participantId, bedarfstraegerId],
);
const courseId = courseRows[0].id;

await client.query(
  `INSERT INTO course_coaches (course_id, coach_id) VALUES ($1, $2), ($1, $3)`,
  [courseId, coachId, toterCoachId],
);

// Termine nur beim aktiven Coach — so lässt sich die Deaktivierte sauber
// entfernen (ein Coach mit Terminen ist absichtlich nicht entfernbar).
console.log("→ 2 signierte Termine (alle beim aktiven Coach)");
await client.query(
  `INSERT INTO sessions (
     course_id, coach_id, session_date, topic, anzahl_ue, modus,
     is_erstgespraech, geeignet, status
   ) VALUES ($1, $2, '2026-08-04', 'Erstgespräch und Eignungsanalyse', 0, 'online', true, true, 'completed')`,
  [courseId, coachId],
);
await client.query(
  `INSERT INTO sessions (
     course_id, coach_id, session_date, topic, anzahl_ue, modus,
     is_erstgespraech, status
   ) VALUES ($1, $2, '2026-08-06', 'Bewerbungsstrategie und Stellenrecherche', 2, 'online', false, 'completed')`,
  [courseId, coachId],
);

console.log("");
console.log("✓ Fertig.");
console.log(`  Kunde:  TEST-DEAKT Hermina Laktos`);
console.log(`  Kurs:   /bildungstraeger/courses/${courseId}/edit`);
console.log(`  Team:   coach.alpha (aktiv) + TEST-DEAKT Natalya Symonova (deaktiviert)`);

client.release();
await pool.end();

#!/usr/bin/env node
// ADDITIVES Staging-Seed für „Bewilligung nach Maßnahmenzeitraum".
//
// Schaltet die Option für den Staging-Träger frei und legt ZWEI Kunden an, die
// sich nur in der Bewilligungsbasis unterscheiden — damit die Gegenprobe
// („am UE-Kunden hat sich nichts geändert") direkt danebensteht:
//
//   1. TEST-ZEITRAUM Nora Zeitler  → Basis „zeitraum", 12 Wochen, Mindest-UE 30
//      Termine enden ~4 Wochen VOR dem Bewilligungsende → beim Abschließen muss
//      die Pflicht-Begründung „Zeitraum nicht ausgeschöpft" greifen, obwohl
//      keine UE-Zahl unterschritten ist.
//   2. TEST-UEBASIS Udo Einheit    → Basis „ue", 40 bewilligte UE, 18 geleistet
//      → muss sich exakt wie bisher verhalten (UE-Unterschreitung = Pflicht).
//
// Löscht NICHTS. Alle Datensätze tragen ein TEST-Präfix.
//
// Nutzung:
//   DATABASE_URL=$(npx neonctl connection-string br-long-pond-alx2tzly \
//     --project-id solitary-waterfall-77539790 --org-id org-flat-haze-22361689 \
//     --pooled --database-name neondb | tail -1) \
//   STAGING_OK=1 node scripts/seed-staging-bewilligung-zeitraum.mjs

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
    WHERE email = 'coach.alpha@signflow-staging.test' AND deleted_at IS NULL LIMIT 1`,
);
if (!coachRows[0]) {
  await fail("Refuse: coach.alpha@signflow-staging.test fehlt — erst seed-staging.mjs laufen lassen.");
}
const coachId = coachRows[0].id;
const tenantId = coachRows[0].tenant_id;

const { rows: bedRows } = await client.query(
  `SELECT id FROM bedarfstraeger WHERE tenant_id = $1::uuid AND deleted_at IS NULL LIMIT 1`,
  [tenantId],
);
if (!bedRows[0]) await fail("Refuse: kein Bedarfsträger im Staging-Tenant.");
const bedarfstraegerId = bedRows[0].id;

console.log("→ Option „Bewilligung nach Zeitraum\" für den Träger freischalten");
await client.query(
  `UPDATE tenants SET bewilligung_zeitraum_enabled = true WHERE id = $1::uuid`,
  [tenantId],
);

const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
const iso = (d) => d.toISOString().slice(0, 10);
const plus = (base, tage) => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + tage);
  return d;
};

// Bewilligungszeitraum: 12 Wochen, sodass er HEUTE noch läuft und die Termine
// deutlich davor enden — genau der Regensburg-Prüffall.
const start = plus(new Date(), -56); // vor 8 Wochen
const ende = plus(start, 84); // + 12 Wochen

async function anlegen({ praefix, name, basis, bewilligteUe, mindestUe, ueProTermin, termine }) {
  const { rows: tn } = await client.query(
    `INSERT INTO participants (tenant_id, name, email, kunden_nr)
       VALUES ($1::uuid, $2, $3, $4) RETURNING id`,
    [
      tenantId,
      `${praefix} ${name}`,
      `${praefix.toLowerCase().replace(/[^a-z]/g, "")}-${stamp}@signflow-staging.test`,
      `160Z${stamp.slice(0, 5)}-${praefix.length}`,
    ],
  );
  const { rows: c } = await client.query(
    `INSERT INTO courses (
       coach_id, participant_id, title, avgs_nummer, durchfuehrungsort,
       anzahl_bewilligte_ue, bewilligungsbasis, mindest_ue,
       bedarfstraeger_id, massnahme_typ,
       avgs_gueltig_von, avgs_gueltig_bis, start_date, end_date, status
     ) VALUES ($1, $2, $3, $4, 'Online', $5, $6, $7, $8, 'EKC', $9, $10, $9, $10, 'active')
     RETURNING id`,
    [
      coachId, tn[0].id, `${praefix} EKC — Karriere-Coaching`,
      `${praefix} 863/42/25`, bewilligteUe, basis, mindestUe,
      bedarfstraegerId, iso(start), iso(ende),
    ],
  );
  const courseId = c[0].id;
  await client.query(
    `INSERT INTO course_coaches (course_id, coach_id) VALUES ($1, $2)`,
    [courseId, coachId],
  );
  await client.query(
    `INSERT INTO sessions (course_id, coach_id, session_date, topic, anzahl_ue,
       modus, is_erstgespraech, geeignet, status)
     VALUES ($1, $2, $3, 'Erstgespräch und Eignungsanalyse', 0, 'online', true, true, 'completed')`,
    [courseId, coachId, iso(start)],
  );
  // Termine ab Woche 1, zwei pro Woche (erfüllt die 2-Termine-Regel).
  for (let i = 0; i < termine; i++) {
    const tag = plus(start, 7 + Math.floor(i / 2) * 7 + (i % 2) * 2);
    await client.query(
      `INSERT INTO sessions (course_id, coach_id, session_date, topic, anzahl_ue,
         modus, is_erstgespraech, status)
       VALUES ($1, $2, $3, 'Bewerbungsstrategie und Stellenrecherche', $4, 'online', false, 'completed')`,
      [courseId, coachId, iso(tag), ueProTermin],
    );
  }
  return { courseId, letzter: iso(plus(start, 7 + Math.floor((termine - 1) / 2) * 7 + ((termine - 1) % 2) * 2)) };
}

console.log("→ Kunde 1: Basis ZEITRAUM (12 Wochen, Mindest-UE 30, Termine enden früh)");
const a = await anlegen({
  praefix: "TEST-ZEITRAUM", name: "Nora Zeitler", basis: "zeitraum",
  bewilligteUe: 0, mindestUe: 30, ueProTermin: "3", termine: 12,
});

console.log("→ Kunde 2: Basis UE (Gegenprobe — muss sich verhalten wie bisher)");
const b = await anlegen({
  praefix: "TEST-UEBASIS", name: "Udo Einheit", basis: "ue",
  bewilligteUe: 40, mindestUe: null, ueProTermin: "3", termine: 6,
});

console.log("");
console.log("✓ Fertig. Bewilligungszeitraum beider Kunden:", iso(start), "→", iso(ende));
console.log(`  ZEITRAUM  /coach/courses/${a.courseId}`);
console.log(`     36 UE geleistet, letzter Termin ${a.letzter} — Zeitraum NICHT ausgeschöpft`);
console.log("     erwartet: Abschluss verlangt Begründung für den Zeitraum, nicht für UE");
console.log(`  UE-BASIS  /coach/courses/${b.courseId}`);
console.log(`     18 von 40 UE, letzter Termin ${b.letzter}`);
console.log("     erwartet: unverändert — Begründung wegen UE-Unterschreitung");

client.release();
await pool.end();

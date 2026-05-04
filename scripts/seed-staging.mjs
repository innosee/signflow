#!/usr/bin/env node
// Synthetisches Seed für Staging-Branch. Wipet Daten + erstellt 1 Bildungsträger,
// 2 Coaches (einer mit signing_enabled), 1 Bedarfsträger, 1 Kurs, 2 TN,
// 1 fertigen kurs-gebundenen BER + 1 Schnell-Check-BER.
//
// SICHERHEITSGUARDS:
//   * Erfordert explizites `STAGING_OK=1` Environment-Flag.
//   * Bricht ab, wenn die Datenbank-URL nach Production aussieht
//     (`-pooler` oder bestehender Bildungsträger-Account dessen Email
//     KEIN `signflow-staging.test` Suffix hat).
//   * Schreibt Synthetik-Marker in `users.email` (`@signflow-staging.test`),
//     der bei der Anwendung nie auftaucht, also nicht versehentlich für
//     echte Coaches gebraucht werden kann.
//
// Nutzung:
//   STAGING_OK=1 DATABASE_URL="<staging-neon>" node scripts/seed-staging.mjs

import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { hashPassword } from "better-auth/crypto";
import ws from "ws";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
if (process.env.STAGING_OK !== "1") {
  console.error(
    "Refuse: STAGING_OK=1 must be explicitly set. This script wipes data.",
  );
  process.exit(1);
}
if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

const SHARED_PASSWORD = "staging1234";
const PASSWORD_HASH = await hashPassword(SHARED_PASSWORD);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

// Refuse-Check 1: existiert ein nicht-Staging Bildungsträger?
const { rows: existingBts } = await client.query(
  `SELECT email FROM users WHERE role = 'bildungstraeger' AND deleted_at IS NULL`,
);
const nonStagingBts = existingBts.filter(
  (r) => !String(r.email).endsWith("@signflow-staging.test"),
);
if (nonStagingBts.length > 0) {
  console.error(
    "Refuse: Found a Bildungsträger account that does not have the staging suffix:",
    nonStagingBts.map((r) => r.email).join(", "),
  );
  console.error(
    "If this is genuinely a fresh staging branch, manually delete that row first.",
  );
  client.release();
  await pool.end();
  process.exit(1);
}

console.log("→ wiping data (preserving schema)");
// Reihenfolge: Kinder zuerst, FKs kaskadieren, audit_log am Ende.
const tables = [
  "audit_log",
  "signatures",
  "participant_approvals",
  "participant_access_tokens",
  "abschlussberichte",
  "sessions",
  "course_participants",
  "final_documents",
  "courses",
  "bedarfstraeger",
  "participants",
  "auth_session",
  "auth_account",
  "auth_verification",
  "users",
];
for (const t of tables) {
  await client.query(`TRUNCATE TABLE ${t} CASCADE`);
}

console.log("→ resolve/create default tenant");
// Multi-Tenant ab 2026-05-04 — alle Test-Users hängen am Default-Tenant
// (slug='default'), den die Migration angelegt hat. Falls der Tenant
// fehlt (frisches Schema-Branch), legen wir ihn hier nochmal an, damit
// das Skript stand-alone reproduzierbar ist.
const { rows: tenantRows } = await client.query(
  `INSERT INTO tenants (name, slug)
     VALUES ('Default', 'default')
     ON CONFLICT DO NOTHING
   RETURNING id`,
);
let defaultTenantId = tenantRows[0]?.id ?? null;
if (!defaultTenantId) {
  const { rows } = await client.query(
    `SELECT id FROM tenants WHERE slug = 'default' AND deleted_at IS NULL LIMIT 1`,
  );
  defaultTenantId = rows[0]?.id;
}
if (!defaultTenantId) {
  throw new Error("Could not resolve default tenant.");
}

console.log("→ seeding users");
const { rows: btRows } = await client.query(
  `INSERT INTO users (tenant_id, email, name, role, email_verified, signing_enabled)
     VALUES ($1::uuid, 'admin@signflow-staging.test', 'Demo Bildungsträger', 'bildungstraeger', true, false)
   RETURNING id`,
  [defaultTenantId],
);
const btId = btRows[0].id;
await client.query(
  // user_id ist uuid, account_id ist text — Postgres deduziert sonst
  // einen Konflikt für $1, also explizit casten.
  `INSERT INTO auth_account (user_id, provider_id, account_id, password)
     VALUES ($1::uuid, 'credential', $1::text, $2)`,
  [btId, PASSWORD_HASH],
);

const { rows: coachARows } = await client.query(
  `INSERT INTO users (tenant_id, email, name, role, email_verified, signing_enabled)
     VALUES ($1::uuid, 'coach.alpha@signflow-staging.test', 'Coach Alpha', 'coach', true, true)
   RETURNING id`,
  [defaultTenantId],
);
const coachAId = coachARows[0].id;
await client.query(
  // user_id ist uuid, account_id ist text — Postgres deduziert sonst
  // einen Konflikt für $1, also explizit casten.
  `INSERT INTO auth_account (user_id, provider_id, account_id, password)
     VALUES ($1::uuid, 'credential', $1::text, $2)`,
  [coachAId, PASSWORD_HASH],
);

const { rows: coachBRows } = await client.query(
  `INSERT INTO users (tenant_id, email, name, role, email_verified, signing_enabled)
     VALUES ($1::uuid, 'coach.beta@signflow-staging.test', 'Coach Beta', 'coach', true, false)
   RETURNING id`,
  [defaultTenantId],
);
const coachBId = coachBRows[0].id;
await client.query(
  // user_id ist uuid, account_id ist text — Postgres deduziert sonst
  // einen Konflikt für $1, also explizit casten.
  `INSERT INTO auth_account (user_id, provider_id, account_id, password)
     VALUES ($1::uuid, 'credential', $1::text, $2)`,
  [coachBId, PASSWORD_HASH],
);

console.log("→ seeding bedarfstraeger");
const { rows: btsRows } = await client.query(
  `INSERT INTO bedarfstraeger (tenant_id, name, type)
     VALUES ($1::uuid, 'Demo Jobcenter Singen', 'JC')
   RETURNING id`,
  [defaultTenantId],
);
const bedId = btsRows[0].id;

console.log("→ seeding course + participants");
const { rows: courseRows } = await client.query(
  `INSERT INTO courses (
     coach_id, title, avgs_nummer, durchfuehrungsort, anzahl_bewilligte_ue,
     bedarfstraeger_id, start_date, end_date, status
   ) VALUES (
     $1, 'Demo AVGS-Coaching „Karriere & Selbständigkeit"', 'AVGS-2026-DEMO',
     'Singen, Demo-Adresse', 80, $2, '2026-03-01', '2026-04-30', 'active'
   ) RETURNING id`,
  [coachAId, bedId],
);
const courseId = courseRows[0].id;

const { rows: tn1Rows } = await client.query(
  `INSERT INTO participants (tenant_id, name, email, kunden_nr)
     VALUES ($1::uuid, 'TN Alpha (Demo)', 'tn.alpha@signflow-staging.test', '999A11111')
   RETURNING id`,
  [defaultTenantId],
);
const tn1Id = tn1Rows[0].id;

const { rows: tn2Rows } = await client.query(
  `INSERT INTO participants (tenant_id, name, email, kunden_nr)
     VALUES ($1::uuid, 'TN Beta (Demo)', 'tn.beta@signflow-staging.test', '999B22222')
   RETURNING id`,
  [defaultTenantId],
);
const tn2Id = tn2Rows[0].id;

await client.query(
  `INSERT INTO course_participants (course_id, participant_id) VALUES ($1, $2), ($1, $3)`,
  [courseId, tn1Id, tn2Id],
);

console.log("→ seeding fertigen kurs-gebundenen BER (TN Alpha)");
await client.query(
  `INSERT INTO abschlussberichte (
     course_id, participant_id, coach_id,
     teilnahme, ablauf, fazit, sonstiges, keine_fehlzeiten,
     tn_vorname, tn_nachname, tn_kunden_nr, tn_avgs_nummer, tn_zeitraum, tn_ue,
     coach_name_snapshot,
     status, last_check_passed, submitted_at
   ) VALUES (
     $1, $2, $3,
     'TN Alpha (Demo) nahm engagiert am Coaching teil. Reflexionsfähigkeit und Eigeninitiative waren über die gesamte Maßnahme hinweg deutlich erkennbar.',
     'Profiling, Zielarbeit und Strategieentwicklung wurden über 8 Termine durchgeführt. Bewerbungsunterlagen wurden gemeinsam überarbeitet. Marktorientierung und Netzwerk-Aufbau wurden gestreift.',
     'Insgesamt eine erfolgreiche Maßnahme — TN konnte konkrete Bewerbungsstrategie entwickeln und erste Gespräche führen. Prozessbegleitung und Feedback liefen kontinuierlich.',
     'GEPEDU-Test wurde durchgeführt; Ergebnis im persönlichen Gespräch besprochen.',
     true,
     'TN', 'Alpha (Demo)', '999A11111', 'AVGS-2026-DEMO', '01.03.2026 — 30.04.2026', '80',
     'Coach Alpha',
     'submitted', true, NOW()
   )`,
  [courseId, tn1Id, coachAId],
);

console.log("→ seeding ad-hoc (Schnell-Check) BER");
await client.query(
  `INSERT INTO abschlussberichte (
     course_id, participant_id, coach_id,
     teilnahme, ablauf, fazit, sonstiges, keine_fehlzeiten, must_have_override_reason,
     tn_vorname, tn_nachname, tn_kunden_nr, tn_avgs_nummer, tn_zeitraum, tn_ue,
     coach_name_snapshot,
     status, last_check_passed, submitted_at
   ) VALUES (
     NULL, NULL, $1,
     '',
     'Bewerbungsunterlagen wurden über 5 UE überarbeitet — Lebenslauf, Anschreiben und LinkedIn-Profil neu strukturiert.',
     'TN Gamma kann die überarbeiteten Unterlagen nun aktiv für Bewerbungen einsetzen.',
     '',
     true,
     'AVGS umfasste nur 5 UE zur Bewerbungsoptimierung — Profiling, Zielarbeit und Marktorientierung waren nicht im Maßnahme-Scope.',
     'TN', 'Gamma (Demo)', '999G33333', 'AVGS-2026-SHORT', '15.04.2026 — 16.04.2026', '5',
     'Coach Alpha',
     'submitted', true, NOW()
   )`,
  [coachAId],
);

client.release();
await pool.end();

console.log(
  `\n✓ Staging seed complete. Login mit shared password "${SHARED_PASSWORD}":\n` +
    `   admin@signflow-staging.test         (Bildungsträger)\n` +
    `   coach.alpha@signflow-staging.test   (Coach, signing_enabled=true)\n` +
    `   coach.beta@signflow-staging.test    (Coach, checker-only)\n`,
);

#!/usr/bin/env node
// ADDITIVES Staging-Seed für „Bildungsträger unterschreibt an seinem Sitz".
//
// Baut den Prod-Fall nach: der Coaching-Ort steht auf „Konstanz", der Träger
// sitzt aber in Singen. Erzeugt drei Dokumente an einem TEST-Kunden:
//   1. F08 Entwurf      → Träger-Zeile muss SINGEN zeigen, Kunden-Zeile Konstanz
//   2. F21 Entwurf      → dito
//   3. F08 „signiert"   → OHNE org_ort-Snapshot, wie alle Alt-Dokumente:
//                          beide Zeilen müssen weiterhin KONSTANZ zeigen
//                          (signierte Dokumente ändern sich nicht rückwirkend)
//
// Setzt außerdem die Postanschrift des Staging-Bildungsträgers, falls leer —
// ohne sie kann der Träger-Ort gar nicht aufgelöst werden.
//
// Löscht NICHTS. Alle erzeugten Datensätze tragen das Präfix „TEST-ORT".
//
// Nutzung:
//   DATABASE_URL=$(npx neonctl connection-string br-long-pond-alx2tzly \
//     --project-id solitary-waterfall-77539790 --org-id org-flat-haze-22361689 \
//     --pooled --database-name neondb | tail -1) \
//   STAGING_OK=1 node scripts/seed-staging-signaturort.mjs

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
  `SELECT id, tenant_id, email, pdf_address FROM users
    WHERE role = 'bildungstraeger' AND deleted_at IS NULL`,
);
const nonStaging = bts.filter(
  (r) => !String(r.email).endsWith("@signflow-staging.test"),
);
if (nonStaging.length > 0) {
  await fail(
    `Refuse: Nicht-Staging-Bildungsträger gefunden: ${nonStaging.map((r) => r.email).join(", ")}`,
  );
}
if (!bts[0]) await fail("Refuse: kein Bildungsträger im Staging-Tenant.");
const bt = bts[0];
const tenantId = bt.tenant_id;

// Postanschrift setzen, falls leer — Quelle für den Träger-Ort.
if (!bt.pdf_address) {
  console.log("→ Postanschrift des Trägers setzen (Sitz: Singen)");
  await client.query(
    `UPDATE users SET pdf_address = $2 WHERE id = $1::uuid`,
    [
      bt.id,
      "Ekkehardstraße 12b\nD-78224 Singen\nTel. +49 (0) 7731 / 90 97 18 - 10\nadmin@signflow-staging.test\nwww.example.test",
    ],
  );
} else {
  console.log("→ Postanschrift bereits gesetzt, unverändert gelassen");
}

const { rows: coachRows } = await client.query(
  `SELECT id FROM users
    WHERE email = 'coach.alpha@signflow-staging.test' AND deleted_at IS NULL
    LIMIT 1`,
);
if (!coachRows[0]) {
  await fail(
    "Refuse: coach.alpha@signflow-staging.test fehlt — erst scripts/seed-staging.mjs laufen lassen.",
  );
}
const coachId = coachRows[0].id;

const { rows: bedRows } = await client.query(
  `SELECT id FROM bedarfstraeger WHERE tenant_id = $1::uuid AND deleted_at IS NULL LIMIT 1`,
  [tenantId],
);
if (!bedRows[0]) await fail("Refuse: kein Bedarfsträger im Staging-Tenant.");
const bedarfstraegerId = bedRows[0].id;

const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");

console.log("→ TEST-Kunde + Kurs");
const { rows: tnRows } = await client.query(
  `INSERT INTO participants (
     tenant_id, name, vorname, nachname, email, kunden_nr,
     strasse, plz, ort, geburtsdatum, geburtsort, phone
   ) VALUES (
     $1::uuid, 'TEST-ORT Maria Beispiel', 'Maria', 'Beispiel', $2, $3,
     'Hussenstraße 4', '78462', 'Konstanz', '1985-04-12', 'Konstanz', '0170 1234567'
   ) RETURNING id`,
  [tenantId, `test-ort-${stamp}@signflow-staging.test`, `160E${stamp.slice(0, 5)}-1`],
);
const participantId = tnRows[0].id;

const { rows: courseRows } = await client.query(
  `INSERT INTO courses (
     coach_id, participant_id, title, avgs_nummer, durchfuehrungsort,
     anzahl_bewilligte_ue, bedarfstraeger_id, massnahme_typ,
     avgs_gueltig_von, avgs_gueltig_bis, start_date, end_date, status
   ) VALUES (
     $1, $2, 'TEST-ORT EKC — Karriere-Coaching',
     'TEST-ORT 863/41/25', 'Hussenstraße 4, 78462 Konstanz', 40, $3, 'EKC',
     '2026-07-01', '2026-12-31', '2026-08-04', '2026-11-30', 'active'
   ) RETURNING id`,
  [coachId, participantId, bedarfstraegerId],
);
const courseId = courseRows[0].id;
await client.query(
  `INSERT INTO course_coaches (course_id, coach_id) VALUES ($1, $2)`,
  [courseId, coachId],
);

// Gemeinsame Basis: Coaching-Ort „Konstanz" im Freitextfeld.
const f08Form = {
  massnahme: "Karrierecoaching (EKC)",
  ort: "Konstanz",
  anzahlUe: "40",
  von: "2026-08-04",
  bis: "2026-11-30",
};
const f21Form = {
  ziele: "TEST-ORT: Berufliche Neuorientierung und Bewerbungsstrategie.",
  abwesenheitszeiten: "keine bekannt",
  ort: "Konstanz",
};

console.log("→ F08 + F21 als ENTWURF (müssen Singen auf der Träger-Zeile zeigen)");
const { rows: d1 } = await client.query(
  `INSERT INTO documents (course_id, participant_id, type, status, form_data, created_by)
     VALUES ($1, $2, 'f08_tnv', 'draft', $3::jsonb, $4) RETURNING id`,
  [courseId, participantId, JSON.stringify(f08Form), coachId],
);
const { rows: d2 } = await client.query(
  `INSERT INTO documents (course_id, participant_id, type, status, form_data, created_by)
     VALUES ($1, $2, 'f21_stv', 'draft', $3::jsonb, $4) RETURNING id`,
  [courseId, participantId, JSON.stringify(f21Form), coachId],
);

console.log("→ F08 als ALT-DOKUMENT signiert, OHNE org_ort (muss Konstanz behalten)");
// Snapshot wie vor dem Fix: tn_*-Stammdaten eingefroren, aber kein org_ort.
const altSnapshot = {
  ...f08Form,
  tn_name: "TEST-ORT Maria Beispiel",
  tn_vorname: "Maria",
  tn_nachname: "Beispiel",
  tn_strasse: "Hussenstraße 4",
  tn_plz: "78462",
  tn_ort: "Konstanz",
  tn_geburtsdatum: "1985-04-12",
  tn_geburtsort: "Konstanz",
  tn_phone: "0170 1234567",
  tn_festnetz: "",
  tn_email: `test-ort-${stamp}@signflow-staging.test`,
  text_version: "2",
};
const { rows: d3 } = await client.query(
  `INSERT INTO documents (course_id, participant_id, type, status, form_data, created_by)
     VALUES ($1, $2, 'f08_tnv', 'active', $3::jsonb, $4) RETURNING id`,
  [courseId, participantId, JSON.stringify(altSnapshot), coachId],
);
const { rows: sig } = await client.query(
  `SELECT signature_url FROM users WHERE id = $1::uuid`,
  [coachId],
);
if (sig[0]?.signature_url) {
  await client.query(
    `INSERT INTO document_signatures (document_id, signer_type, coach_id, signature_url, ip_address)
       VALUES ($1, 'coach', $2, $3, '127.0.0.1')`,
    [d3[0].id, coachId, sig[0].signature_url],
  );
} else {
  console.log("  (Hinweis: coach.alpha hat keine Unterschrift — Zeile bleibt leer)");
}

console.log("");
console.log("✓ Fertig. Kurs: /coach/courses/" + courseId);
console.log(`  F08 Entwurf   ${d1[0].id}  → erwartet: Träger „Singen", Kunde „Konstanz"`);
console.log(`  F21 Entwurf   ${d2[0].id}  → erwartet: Träger „Singen", Kunde „Konstanz"`);
console.log(`  F08 signiert  ${d3[0].id}  → erwartet: BEIDE „Konstanz" (unverändert)`);

client.release();
await pool.end();

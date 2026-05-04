import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { hashPassword } from "better-auth/crypto";
import { parseArgs } from "node:util";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

// Server-Skript zum Anlegen eines neuen Tenants samt Bildungsträger-Admin.
//
// Brauchen wir, weil es im UI keinen offenen Onboarding-Flow für neue
// Bildungsträger-Organisationen gibt — der erste BT entsteht via
// /setup, alle weiteren entstehen während des Multi-Tenant-Sprints
// durch dieses Skript. Self-Onboarding kommt später mit Stripe.
//
// Atomar: Tenant + User + AuthAccount in einer Transaktion. Idempotenz
// per Slug-Check — Re-Run mit demselben Slug bricht ab, statt einen
// zweiten Tenant zu erzeugen.
//
// Beispiel:
//   DATABASE_URL=$(npx neonctl connection-string staging \
//     --project-id solitary-waterfall-77539790 \
//     --pooled --database-name neondb 2>&1 | tail -1) \
//   node scripts/create-tenant.mjs \
//     --slug=test-tenant-2 \
//     --name="Test-Träger Zwei" \
//     --admin-email=admin2@signflow-staging.test \
//     --admin-name="Admin Zwei" \
//     --admin-password=staging1234

const { values } = parseArgs({
  options: {
    slug: { type: "string" },
    name: { type: "string" },
    "admin-email": { type: "string" },
    "admin-name": { type: "string" },
    "admin-password": { type: "string" },
  },
});

const slug = values.slug?.trim();
const name = values.name?.trim();
const adminEmail = values["admin-email"]?.trim().toLowerCase();
const adminName = values["admin-name"]?.trim();
const adminPassword = values["admin-password"];

if (!slug || !name || !adminEmail || !adminName || !adminPassword) {
  console.error(
    "usage: create-tenant.mjs --slug=<slug> --name=<name> --admin-email=<email> --admin-name=<name> --admin-password=<pw>",
  );
  process.exit(1);
}
if (adminPassword.length < 8) {
  console.error("admin-password muss mindestens 8 Zeichen haben.");
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error("slug darf nur a-z, 0-9 und Bindestriche enthalten.");
  process.exit(1);
}

const passwordHash = await hashPassword(adminPassword);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query("BEGIN");

  // Slug-Konflikt? — abbrechen, statt versehentlich einen zweiten Tenant
  // mit demselben Logo/Adressen-Default-Block zu erzeugen.
  const slugCheck = await client.query(
    `SELECT id FROM tenants WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`,
    [slug],
  );
  if (slugCheck.rows.length > 0) {
    throw new Error(
      `Tenant mit slug='${slug}' existiert bereits (id=${slugCheck.rows[0].id}). Abbruch.`,
    );
  }

  const emailCheck = await client.query(
    `SELECT id, deleted_at FROM users WHERE email = $1 LIMIT 1`,
    [adminEmail],
  );
  if (emailCheck.rows.length > 0 && !emailCheck.rows[0].deleted_at) {
    throw new Error(
      `User mit email='${adminEmail}' existiert bereits (id=${emailCheck.rows[0].id}, aktiv). Abbruch.`,
    );
  }
  if (emailCheck.rows.length > 0 && emailCheck.rows[0].deleted_at) {
    throw new Error(
      `User mit email='${adminEmail}' existiert soft-deleted (id=${emailCheck.rows[0].id}). ` +
        `Skript handhabt Resurrect nicht — bitte manuell aufräumen oder andere E-Mail verwenden.`,
    );
  }

  const tenantInsert = await client.query(
    `INSERT INTO tenants (name, slug)
     VALUES ($1, $2)
     RETURNING id`,
    [name, slug],
  );
  const tenantId = tenantInsert.rows[0].id;
  console.log(`✓ Tenant angelegt: ${name} (slug=${slug}, id=${tenantId})`);

  const userInsert = await client.query(
    `INSERT INTO users (tenant_id, email, name, role, email_verified)
     VALUES ($1::uuid, $2, $3, 'bildungstraeger', true)
     RETURNING id`,
    [tenantId, adminEmail, adminName],
  );
  const userId = userInsert.rows[0].id;
  console.log(`✓ Bildungsträger-User angelegt: ${adminName} <${adminEmail}> (id=${userId})`);

  await client.query(
    // user_id ist uuid, account_id ist text — explizit casten (gleiches
    // Pattern wie in seed-staging.mjs, sonst beschwert sich Postgres
    // über mehrdeutige Typen für $1).
    `INSERT INTO auth_account (user_id, provider_id, account_id, password)
     VALUES ($1::uuid, 'credential', $1::text, $2)`,
    [userId, passwordHash],
  );
  console.log(`✓ AuthAccount angelegt (Passwort-Hash gespeichert)`);

  await client.query("COMMIT");
  console.log(`\n✓ Tenant + Admin atomar angelegt.`);
  console.log(`  Login: ${adminEmail} / <password>`);
  console.log(`  Tenant-ID: ${tenantId}`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("\n✗ Tenant-Anlage fehlgeschlagen:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}

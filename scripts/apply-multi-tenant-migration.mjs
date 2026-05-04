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

// Multi-Tenant-Refactor — additive Migration mit Backfill.
//
// Strategie pro Tabelle (users, bedarfstraeger, participants):
//   1) Spalte `tenant_id` nullable hinzufügen
//   2) Bestehende Zeilen mit Default-Tenant-ID befüllen
//   3) NOT NULL + FK setzen
//
// Default-Tenant heißt slug='default' (Erango-Bestand) — kann später per
// Admin-UI umbenannt werden, ohne dass die Slug-FKs neu wandern müssen.
//
// `participants.email`-Unique wechselt von global (`participants_email_key`)
// auf composite `(tenant_id, email)` — derselbe Mensch kann bei mehreren
// Trägern Kunde sein.
//
// Skript ist idempotent: alle Statements via IF [NOT] EXISTS oder DO-Block
// mit Existenz-Check. Mehrfaches Anwenden ist no-op.
//
// Cutover-Default: Postgres erlaubt keine Subqueries in DEFAULT-Klauseln,
// also lösen wir die Default-Tenant-ID nach Schritt 2 auf und interpolieren
// sie als Literal-UUID in die SET DEFAULT-Statements. Sicher, weil die
// UUID frisch aus unserem eigenen INSERT/SELECT kommt.

const statements = [
  // 1. tenants-Tabelle
  `CREATE TABLE IF NOT EXISTS tenants (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL,
     slug text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     deleted_at timestamptz
   )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_active_uq
     ON tenants (slug)
     WHERE deleted_at IS NULL`,

  // 2. Default-Tenant einfügen (Erango-Bestand)
  `INSERT INTO tenants (name, slug)
     SELECT 'Default', 'default'
     WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'default' AND deleted_at IS NULL)`,

  // 3. users.tenant_id (nullable add → backfill → NOT NULL → FK)
  //
  // DB-Default auf Default-Tenant setzen ist Cutover-Schutz: zwischen
  // Migration (Production-DB hat NOT NULL tenant_id) und Code-Deploy
  // (Vercel-Build dauert ~60s) läuft kurz alter Code gegen migriertes
  // Schema. Ohne Default würden Inserts ohne tenant_id (alter Code)
  // crashen. Mit Default geht der Insert durch und landet im Default-
  // Tenant — was zur Cutover-Zeit korrekt ist (Single-Tenant-Stand).
  `ALTER TABLE users
     ADD COLUMN IF NOT EXISTS tenant_id uuid`,

  `UPDATE users
     SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' AND deleted_at IS NULL)
     WHERE tenant_id IS NULL`,

  // Sentinel: wird nach dem ID-Lookup ersetzt (siehe runtime-Loop unten).
  `__SET_DEFAULT_users__`,

  `ALTER TABLE users
     ALTER COLUMN tenant_id SET NOT NULL`,

  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'users_tenant_id_fk'
     ) THEN
       ALTER TABLE users
         ADD CONSTRAINT users_tenant_id_fk
         FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
     END IF;
   END $$`,

  // 4. bedarfstraeger.tenant_id (mit Cutover-Default — siehe users)
  `ALTER TABLE bedarfstraeger
     ADD COLUMN IF NOT EXISTS tenant_id uuid`,

  `UPDATE bedarfstraeger
     SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' AND deleted_at IS NULL)
     WHERE tenant_id IS NULL`,

  `__SET_DEFAULT_bedarfstraeger__`,

  `ALTER TABLE bedarfstraeger
     ALTER COLUMN tenant_id SET NOT NULL`,

  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'bedarfstraeger_tenant_id_fk'
     ) THEN
       ALTER TABLE bedarfstraeger
         ADD CONSTRAINT bedarfstraeger_tenant_id_fk
         FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
     END IF;
   END $$`,

  `CREATE INDEX IF NOT EXISTS bedarfstraeger_tenant_idx ON bedarfstraeger (tenant_id)`,

  // 5. participants.tenant_id (mit Cutover-Default — siehe users)
  `ALTER TABLE participants
     ADD COLUMN IF NOT EXISTS tenant_id uuid`,

  `UPDATE participants
     SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' AND deleted_at IS NULL)
     WHERE tenant_id IS NULL`,

  `__SET_DEFAULT_participants__`,

  `ALTER TABLE participants
     ALTER COLUMN tenant_id SET NOT NULL`,

  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'participants_tenant_id_fk'
     ) THEN
       ALTER TABLE participants
         ADD CONSTRAINT participants_tenant_id_fk
         FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
     END IF;
   END $$`,

  `CREATE INDEX IF NOT EXISTS participants_tenant_idx ON participants (tenant_id)`,

  // 6. participants.email Unique umstellen — alten Constraint droppen,
  //    composite (tenant_id, email) anlegen.
  //    Drizzle hat den alten als `participants_email_unique` benannt
  //    (Convention für `.unique()` ohne expliziten Namen ab v0.34+).
  //    Älterer Bestand könnte `participants_email_key` heißen.
  `DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'participants_email_unique') THEN
       ALTER TABLE participants DROP CONSTRAINT participants_email_unique;
     END IF;
     IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'participants_email_key') THEN
       ALTER TABLE participants DROP CONSTRAINT participants_email_key;
     END IF;
   END $$`,

  `CREATE UNIQUE INDEX IF NOT EXISTS participants_tenant_email_uq
     ON participants (tenant_id, email)`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");

  // Pass 1: alles bis zur Default-Tenant-Anlage durchführen, dabei
  // Sentinels überspringen.
  let defaultTenantId = null;
  const sentinelTables = ["users", "bedarfstraeger", "participants"];
  for (const stmt of statements) {
    if (sentinelTables.some((t) => stmt === `__SET_DEFAULT_${t}__`)) {
      // Default-Tenant-ID einmalig auflösen, sobald wir den ersten Sentinel
      // sehen. Wir können das nicht früher tun, weil die Tenants-Tabelle
      // erst durch frühere Statements existiert.
      if (!defaultTenantId) {
        const { rows } = await client.query(
          `SELECT id FROM tenants WHERE slug = 'default' AND deleted_at IS NULL LIMIT 1`,
        );
        if (!rows[0]) {
          throw new Error("Default-Tenant nicht gefunden — Migration kann DEFAULT nicht setzen.");
        }
        defaultTenantId = rows[0].id;
        console.log(`  (Default-Tenant-ID aufgelöst: ${defaultTenantId})`);
      }
      const table = stmt.replace(/^__SET_DEFAULT_|__$/g, "");
      const setDefault = `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT '${defaultTenantId}'::uuid`;
      console.log("→", setDefault.slice(0, 80));
      await client.query(setDefault);
      continue;
    }
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  await client.query("COMMIT");
  console.log(
    "\n✓ Multi-Tenant-Migration angewendet (tenants + tenant_id auf users/bedarfstraeger/participants)",
  );
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}

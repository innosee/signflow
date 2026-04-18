import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const statements = [
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned" boolean DEFAULT false NOT NULL`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_reason" text`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_expires" timestamp with time zone`,
  `ALTER TABLE "auth_session" ADD COLUMN IF NOT EXISTS "impersonated_by" uuid`,
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name = 'auth_session_impersonated_by_users_id_fk'
     ) THEN
       ALTER TABLE "auth_session"
         ADD CONSTRAINT "auth_session_impersonated_by_users_id_fk"
         FOREIGN KEY ("impersonated_by") REFERENCES "public"."users"("id") ON DELETE set null;
     END IF;
   END $$`,
];

for (const stmt of statements) {
  console.log("→", stmt.split("\n")[0].slice(0, 80));
  await sql.query(stmt);
}
console.log("\n✓ Migration applied");

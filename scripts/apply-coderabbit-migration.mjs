import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const statements = [
  // 1. Partial unique email on users — allows a soft-deleted coach
  //    to be re-invited with the same email later.
  `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_unique"`,
  `DROP INDEX IF EXISTS "users_email_unique"`,
  `DROP INDEX IF EXISTS "users_email_active_uq"`,
  `CREATE UNIQUE INDEX "users_email_active_uq" ON "users" ("email") WHERE "deleted_at" IS NULL`,

  // 2. session_tokens: store hash, not plaintext. Invalidate all existing
  //    plaintext tokens (pre-prod — acceptable; prod would need re-issuance).
  `DELETE FROM "session_tokens"`,
  // Rename only if the old column still exists
  `DO $$ BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name='session_tokens' AND column_name='token'
     ) AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name='session_tokens' AND column_name='token_hash'
     ) THEN
       ALTER TABLE "session_tokens" RENAME COLUMN "token" TO "token_hash";
     END IF;
   END $$`,
  `DROP INDEX IF EXISTS "session_tokens_token_uq"`,
  `DROP INDEX IF EXISTS "session_tokens_token_hash_uq"`,
  `CREATE UNIQUE INDEX "session_tokens_token_hash_uq" ON "session_tokens" ("token_hash")`,

  // 3. signatures check constraint: signer_type ↔ course_participant_id
  `ALTER TABLE "signatures" DROP CONSTRAINT IF EXISTS "signatures_signer_type_cp_consistency"`,
  `ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signer_type_cp_consistency"
     CHECK (
       (signer_type = 'participant' AND course_participant_id IS NOT NULL)
       OR (signer_type = 'coach' AND course_participant_id IS NULL)
     )`,
];

for (const stmt of statements) {
  const first = stmt.split("\n")[0].trim().slice(0, 80);
  console.log("→", first);
  await sql.query(stmt);
}
console.log("\n✓ CodeRabbit migration applied");

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";

import * as schema from "@/db/schema";

/**
 * Test-Datenbank für Integrationstests: eine frische In-Process-PGlite mit dem
 * echten Schema aus src/db/schema.ts. Lebt nur im Testprozess und wird nach dem
 * Lauf verworfen — sie verbindet sich NIE mit Neon (Prod oder Staging).
 */
export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const { apply } = await pushSchema(schema, db as never);
  await apply();
  return db as unknown as TestDb;
}

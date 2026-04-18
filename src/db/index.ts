import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// In Node.js brauchen wir einen WebSocket-Constructor — Neon serverless
// nutzt WS, damit echte Sessions (→ Transactions) möglich sind. Im Edge-
// Runtime gibt's nativen WebSocket, dort würde dieser Block ignoriert.
if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

// Pool in der globalThis cachen — bei Next.js-HMR und Serverless-Warm-Starts
// sonst würden pro Reload neue Pools aufgemacht.
const globalForPool = globalThis as unknown as {
  __neon_pool?: Pool;
};

const pool =
  globalForPool.__neon_pool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") {
  globalForPool.__neon_pool = pool;
}

export const db = drizzle(pool, { schema });
export { schema };

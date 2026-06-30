import "server-only";

import { and, count, desc, eq, gt, isNull } from "drizzle-orm";

import { db, schema } from "@/db";

export type ChangelogEntry = {
  id: string;
  title: string;
  body: string;
  publishedAt: Date;
};

/** Alle veröffentlichten Einträge, neueste zuerst. */
export async function listChangelogEntries(): Promise<ChangelogEntry[]> {
  return db
    .select({
      id: schema.changelogEntries.id,
      title: schema.changelogEntries.title,
      body: schema.changelogEntries.body,
      publishedAt: schema.changelogEntries.publishedAt,
    })
    .from(schema.changelogEntries)
    .where(isNull(schema.changelogEntries.deletedAt))
    .orderBy(desc(schema.changelogEntries.publishedAt));
}

/**
 * Zahl der für diesen User ungelesenen Einträge (publishedAt > last_seen).
 * `last_seen = null` (noch nie geöffnet) → alle veröffentlichten Einträge
 * zählen. Treibt das blaue Badge im AppHeader.
 */
export async function getUnreadChangelogCount(userId: string): Promise<number> {
  const [user] = await db
    .select({ lastSeen: schema.users.changelogLastSeenAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const lastSeen = user?.lastSeen ?? null;

  const [row] = await db
    .select({ value: count() })
    .from(schema.changelogEntries)
    .where(
      and(
        isNull(schema.changelogEntries.deletedAt),
        lastSeen
          ? gt(schema.changelogEntries.publishedAt, lastSeen)
          : undefined,
      ),
    );

  return row?.value ?? 0;
}

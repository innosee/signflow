"use server";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { getCurrentSession, isImpersonating } from "@/lib/dal";

/**
 * Setzt die Lesemarke des Users auf jetzt → das blaue „Neu"-Badge im Header
 * verschwindet beim nächsten Request. Wird vom Client beim Öffnen der
 * /neu-Seite einmal aufgerufen.
 *
 * Während Impersonation bewusst ein No-Op: es ist eine schreibende Aktion und
 * würde die Lesemarke des echten Coaches verfälschen (CLAUDE.md → Auth:
 * schreibende Aktionen während Impersonation blockiert).
 */
export async function markChangelogSeen(): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user) return;
  if (isImpersonating(session)) return;

  await db
    .update(schema.users)
    .set({ changelogLastSeenAt: new Date() })
    .where(eq(schema.users.id, session.user.id));
}

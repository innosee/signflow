import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export type SessionData = Awaited<ReturnType<typeof auth.api.getSession>>;

export const getCurrentSession = cache(async (): Promise<SessionData> => {
  const h = await headers();
  return auth.api.getSession({ headers: h });
});

export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAgency() {
  const session = await requireSession();
  if (session.user.role !== "agency") redirect("/");
  return session;
}

export async function requireCoach() {
  const session = await requireSession();
  if (session.user.role !== "coach") redirect("/");
  return session;
}

export function isImpersonating(session: SessionData): boolean {
  return !!session?.session?.impersonatedBy;
}

/**
 * Schreibende Aktionen — insbesondere Signaturen — sind während Impersonation
 * hart blockiert, sonst wäre die rechtliche Beweiskraft der digitalen
 * Unterschrift kaputt (Coach könnte behaupten, Agency habe in seinem Namen
 * signiert). Siehe CLAUDE.md → Auth & Berechtigungen.
 */
export function assertNotImpersonating(session: SessionData): void {
  if (isImpersonating(session)) {
    throw new Error(
      "Schreibende Aktionen sind während Impersonation nicht erlaubt.",
    );
  }
}

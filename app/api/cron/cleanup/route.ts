import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runRetentionCleanup } from "@/lib/retention";

export const runtime = "nodejs";
// Cron-Aufrufe dürfen nie aus einem Cache beantwortet werden.
export const dynamic = "force-dynamic";

/**
 * Täglicher Aufräum-Cron (siehe `vercel.json` → crons). Führt die
 * DSGVO-Löschroutinen aus `src/lib/retention.ts` aus:
 *   - abgelaufene `participant_access_tokens` (30 Tage nach Ablauf)
 *   - nicht-signaturbezogene `audit_log`-Einträge (älter als 12 Monate)
 *
 * Auth: Vercel ruft Cron-Endpoints mit `Authorization: Bearer $CRON_SECRET`
 * auf, sobald die Env-Var `CRON_SECRET` im Projekt gesetzt ist. Ohne gesetztes
 * Secret läuft hier nichts (503) — Fail-closed, damit der Endpoint nicht
 * versehentlich öffentlich triggerbar deployed wird.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET ist nicht konfiguriert." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const authBuf = Buffer.from(auth);
  const expectedBuf = Buffer.from(expected);
  const authorized =
    authBuf.length === expectedBuf.length &&
    timingSafeEqual(authBuf, expectedBuf);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runRetentionCleanup();
    console.log(
      `[cron/cleanup] Tokens gelöscht: ${result.deletedTokens}, Audit-Log-Einträge gelöscht: ${result.deletedAuditLogEntries}`,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/cleanup] Löschroutine fehlgeschlagen:", error);
    return NextResponse.json(
      { ok: false, error: "Löschroutine fehlgeschlagen." },
      { status: 500 },
    );
  }
}

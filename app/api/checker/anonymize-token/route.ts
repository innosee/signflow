import { createHmac, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getCurrentSession, isImpersonating } from "@/lib/dal";

export const runtime = "nodejs";

const TTL_SECONDS = 60;

/**
 * Mintet einen kurzlebigen HMAC-Token für den IONOS-Anonymisierungs-Proxy.
 *
 * Der Browser verwendet den Token, um `anon.signflow.coach` direkt aufzurufen.
 * So sehen Vercel-Server den Rohtext nie — Anforderung aus
 * docs/abschlussbericht-checker.md §2.
 *
 * Token-Format: "<exp>.<nonce>.<sig>"
 *   exp:   Unix-Sekunden (now + TTL)
 *   nonce: hex(random 8 bytes)
 *   sig:   base64url(HMAC-SHA256(IONOS_PROXY_SHARED_SECRET, "<exp>.<nonce>"))
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "coach") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (isImpersonating(session)) {
    return NextResponse.json(
      {
        error:
          "Schreibende Aktionen sind während Impersonation nicht erlaubt.",
      },
      { status: 403 },
    );
  }

  const proxyUrl = process.env.IONOS_PROXY_URL;
  const secret = process.env.IONOS_PROXY_SHARED_SECRET;

  if (!proxyUrl || !secret) {
    return NextResponse.json(
      {
        error:
          "Anonymisierungs-Proxy nicht konfiguriert (IONOS_PROXY_URL oder IONOS_PROXY_SHARED_SECRET fehlt)",
      },
      { status: 503 },
    );
  }

  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const nonce = randomBytes(8).toString("hex");
  const sig = createHmac("sha256", secret)
    .update(`${exp}.${nonce}`)
    .digest("base64url");
  const token = `${exp}.${nonce}.${sig}`;

  return NextResponse.json(
    {
      token,
      proxyUrl: proxyUrl.replace(/\/$/, ""),
      expiresAt: exp * 1000,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}

import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.IONOS_PROXY_SHARED_SECRET;

const SEEN_NONCES = new Map();
const NONCE_WINDOW_MS = 120_000;

function pruneNonces(now) {
  for (const [nonce, expMs] of SEEN_NONCES) {
    if (expMs < now) SEEN_NONCES.delete(nonce);
  }
}

export function verifyToken(header) {
  if (!SECRET) throw new Error("IONOS_PROXY_SHARED_SECRET not set");
  if (!header || typeof header !== "string") return { ok: false, reason: "missing auth header" };

  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return { ok: false, reason: "malformed auth header" };
  const token = match[1];

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "bad token format" };
  const [exp, nonce, sig] = parts;

  const expSec = Number(exp);
  if (!Number.isFinite(expSec)) return { ok: false, reason: "bad exp" };
  const nowSec = Math.floor(Date.now() / 1000);
  if (expSec < nowSec) return { ok: false, reason: "expired" };
  if (expSec > nowSec + 300) return { ok: false, reason: "exp too far in future" };

  const expected = createHmac("sha256", SECRET).update(`${exp}.${nonce}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature mismatch" };
  }

  const nowMs = Date.now();
  pruneNonces(nowMs);
  if (SEEN_NONCES.has(nonce)) return { ok: false, reason: "nonce replay" };
  SEEN_NONCES.set(nonce, nowMs + NONCE_WINDOW_MS);

  return { ok: true };
}

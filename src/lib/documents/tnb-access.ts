import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Simpler Zugangscode-Schutz für die öffentliche /tnb-Mini-App.
 *
 * Kein Login/Session — nur ein geteilter Code (Env `TNB_ACCESS_CODE`), den
 * erango an berechtigte Personen weitergibt. Ziel ist NICHT hohe Sicherheit,
 * sondern zu verhindern, dass beliebige Besucher:innen echt aussehende
 * erango-Bescheinigungen mit hinterlegter GF-Signatur erzeugen.
 *
 * Ablauf: Code-Eingabe → Server-Action prüft gegen Env → setzt einen
 * httpOnly-Cookie mit dem SHA-256 des Codes. Jede /tnb-Route (Seite, Print,
 * PDF) prüft den Cookie serverseitig (authoritativ, nicht im Proxy).
 *
 * Fail-closed: Ist `TNB_ACCESS_CODE` nicht gesetzt, ist die App gesperrt
 * (kein offener Zugang durch vergessene Env).
 */

export const TNB_ACCESS_COOKIE = "tnb_access";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function expectedHash(): string | null {
  const code = process.env.TNB_ACCESS_CODE?.trim();
  return code ? sha256Hex(code) : null;
}

/** Konstantzeit-Vergleich zweier Hex-Strings gleicher Länge. */
function hexEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** Prüft den eingegebenen Code gegen die Env. */
export function verifyTnbCode(code: string): boolean {
  const expected = expectedHash();
  if (!expected) return false;
  return hexEquals(sha256Hex(code.trim()), expected);
}

/** Cookie-Wert, der bei korrektem Code gesetzt wird (Hash, nicht Klartext). */
export function tnbCodeCookieValue(code: string): string {
  return sha256Hex(code.trim());
}

/** Ob der aktuelle Request einen gültigen Zugangs-Cookie mitbringt. */
export async function hasTnbAccess(): Promise<boolean> {
  const expected = expectedHash();
  if (!expected) return false;
  const cookie = (await cookies()).get(TNB_ACCESS_COOKIE)?.value;
  return cookie != null && hexEquals(cookie, expected);
}

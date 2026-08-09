"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  TNB_ACCESS_COOKIE,
  tnbCodeCookieValue,
  verifyTnbCode,
} from "@/lib/documents/tnb-access";

export type TnbGateState = { error: string | null };

/**
 * Prüft den eingegebenen Zugangscode und setzt bei Erfolg den Access-Cookie.
 * Bei Fehler wird der State (mit Meldung) zurückgegeben — das Formular behält
 * den getippten Wert (controlled State im Client).
 */
export async function submitTnbCode(
  _prev: TnbGateState,
  formData: FormData,
): Promise<TnbGateState> {
  const code = String(formData.get("code") ?? "");
  if (!verifyTnbCode(code)) {
    return { error: "Code ungültig." };
  }

  (await cookies()).set(TNB_ACCESS_COOKIE, tnbCodeCookieValue(code), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Pfad "/" (nicht "/tnb"), damit der Cookie auch an /api/tnb/pdf geht —
    // die PDF-Route leitet ihn an den Headless-Browser für /tnb/print weiter.
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 Tage
  });

  redirect("/tnb");
}

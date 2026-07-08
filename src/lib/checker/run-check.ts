import { AuthRequiredError } from "./errors";
import type { CheckerInput, CheckerResult } from "./types";

/**
 * Ruft den serverseitigen Azure-Check auf.
 *
 * WICHTIG: `input` muss bereits pseudonymisiert sein. Der Aufrufer schickt
 * ausschließlich `anonResult.anonymized` (aus `anonymize()`) hierher — nie
 * Rohtext. In Production ist doppelt abgesichert: `anonymize()` wirft, wenn der
 * IONOS-Proxy fehlt (fail-closed), und `/api/checker/check` verweigert den
 * Azure-Call serverseitig, wenn der Proxy nicht konfiguriert ist. Siehe
 * docs/abschlussbericht-checker.md §2.
 */
export async function runCheck(input: CheckerInput): Promise<CheckerResult> {
  const res = await fetch("/api/checker/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new AuthRequiredError();
    }
    let message = `Check fehlgeschlagen (HTTP ${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // body war kein JSON — Default-Message reicht
    }
    throw new Error(message);
  }

  return (await res.json()) as CheckerResult;
}

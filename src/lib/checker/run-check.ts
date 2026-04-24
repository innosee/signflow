import type { CheckerInput, CheckerResult } from "./types";

/**
 * Ruft den serverseitigen Azure-Check auf.
 *
 * Hinweis: Bis der IONOS-Anonymisierungs-Proxy live ist, sendet diese Funktion
 * den Rohtext direkt an Azure OpenAI EU. Für Production muss `input` vorher
 * über `anon.signflow.coach` pseudonymisiert werden — siehe
 * docs/abschlussbericht-checker.md §2.
 */
export async function runCheck(input: CheckerInput): Promise<CheckerResult> {
  const res = await fetch("/api/checker/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
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

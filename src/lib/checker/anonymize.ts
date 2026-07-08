import { AuthRequiredError } from "./errors";
import type { CheckerInput } from "./types";

export type AnonEntity = {
  type:
    | "NAME"
    | "ORT"
    | "PLZ"
    | "ORG"
    | "KUNDEN_NR"
    | "DATUM"
    | "EMAIL"
    | "IBAN"
    | "TEL"
    | "SONSTIGES";
  original: string;
  placeholder: string;
};

export type AnonResult = {
  /** Anonymisierte Sections — werden an Azure geschickt */
  anonymized: CheckerInput;
  /** Lookup-Tabelle für Reverse-Mapping. Bleibt im Browser, geht nie an Vercel oder Azure. */
  entities: AnonEntity[];
  /** True wenn IONOS-Proxy nicht konfiguriert war und Klartext durchgereicht wurde. */
  bypassed: boolean;
};

type TokenResponse = {
  token: string;
  proxyUrl: string;
  expiresAt: number;
};

type ProxyResponse = {
  anonymized: { teilnahme: string; ablauf: string; fazit: string };
  entities: AnonEntity[];
};

/**
 * Holt einen kurzlebigen HMAC-Token aus Vercel und ruft damit den IONOS-Proxy
 * direkt aus dem Browser auf. Vercel sieht den Rohtext NICHT.
 *
 * Wenn der Proxy noch nicht konfiguriert ist (503 vom Token-Endpoint):
 *  - **Production: fail-closed.** Es wird geworfen, statt Klartext an Azure zu
 *    schicken. Ein vergessener/rotierter `IONOS_PROXY_*`-Env-Var darf niemals
 *    dazu führen, dass unanonymisierte Sozialdaten das Land verlassen.
 *  - **Nicht-Production (Dev/Preview): Bypass** mit `bypassed: true`, damit man
 *    den Checker ohne laufenden Proxy lokal ausprobieren kann.
 *
 * `NODE_ENV` wird von Next.js zur Build-Zeit auch ins Client-Bundle inlined,
 * die Unterscheidung funktioniert also im Browser.
 */
export async function anonymize(input: CheckerInput): Promise<AnonResult> {
  let tokenRes: Response;
  try {
    tokenRes = await fetch("/api/checker/anonymize-token", {
      method: "GET",
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `Token-Endpoint nicht erreichbar: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (tokenRes.status === 401) {
    throw new AuthRequiredError();
  }
  if (tokenRes.status === 503) {
    // Proxy nicht konfiguriert. In Production ist das ein harter Abbruch:
    // lieber kein Check als Klartext an Azure. Nur außerhalb von Production
    // fällt der Flow bewusst auf einen Klartext-Bypass zurück.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Anonymisierung ist derzeit nicht verfügbar — die Prüfung wurde " +
          "abgebrochen, damit kein Klartext übertragen wird. Bitte später " +
          "erneut versuchen oder den Support kontaktieren.",
      );
    }
    return {
      anonymized: input,
      entities: [],
      bypassed: true,
    };
  }
  if (!tokenRes.ok) {
    let message = `Token-Mint fehlgeschlagen (HTTP ${tokenRes.status})`;
    try {
      const data = (await tokenRes.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const { token, proxyUrl } = (await tokenRes.json()) as TokenResponse;

  let proxyRes: Response;
  try {
    proxyRes = await fetch(`${proxyUrl}/v1/anonymize`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sections: input }),
    });
  } catch (err) {
    throw new Error(
      `IONOS-Proxy nicht erreichbar: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!proxyRes.ok) {
    let message = `Anonymisierung fehlgeschlagen (HTTP ${proxyRes.status})`;
    try {
      const data = (await proxyRes.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const data = (await proxyRes.json()) as ProxyResponse;
  return {
    anonymized: {
      teilnahme: data.anonymized.teilnahme,
      ablauf: data.anonymized.ablauf,
      fazit: data.anonymized.fazit,
      // Maßnahmetyp ist kein PII — der Proxy gibt ihn nicht zurück, also vom
      // Original übernehmen. SONST fällt der Check immer auf EKC-Default zurück
      // (steuert Pflichtbausteine/Konkretheit + Mismatch-Erkennung).
      massnahmeTyp: input.massnahmeTyp,
    },
    entities: data.entities,
    bypassed: false,
  };
}

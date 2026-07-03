import { afterEach, describe, expect, it, vi } from "vitest";

import { anonymize } from "./anonymize";
import { AuthRequiredError } from "./errors";
import type { CheckerInput } from "./types";

/**
 * Regression zu PR #133 (docs/test-plan-access-control.md §E/§G):
 * Fehlt der IONOS-Anonymizer-Proxy (503 vom Token-Endpoint), darf in Production
 * KEIN Klartext an Azure gehen — anonymize() muss werfen. Nur außerhalb von
 * Production ist der Klartext-Bypass erlaubt (lokales Ausprobieren).
 */

const INPUT: CheckerInput = {
  teilnahme: "Herr Max Mustermann nahm regelmäßig teil.",
  ablauf: "Bewerbungstraining in Singen.",
  fazit: "Vermittlung wahrscheinlich.",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubFetch(...responses: unknown[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("anonymize – fail-closed bei fehlendem Proxy", () => {
  it("WIRFT in Production, wenn der Token-Endpoint 503 gibt (kein Klartext an Azure)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    stubFetch({ status: 503 });

    await expect(anonymize(INPUT)).rejects.toThrow();
  });

  it("bypasst NUR außerhalb von Production (Dev)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    stubFetch({ status: 503 });

    const result = await anonymize(INPUT);
    expect(result.bypassed).toBe(true);
    // Im Bypass geht der Klartext unverändert durch — nur lokal akzeptabel.
    expect(result.anonymized).toEqual(INPUT);
    expect(result.entities).toEqual([]);
  });

  it("wirft AuthRequiredError bei 401 (Session abgelaufen)", async () => {
    stubFetch({ status: 401 });
    await expect(anonymize(INPUT)).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("nutzt den Proxy im Normalfall und liefert pseudonymisierten Text (bypassed: false)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    stubFetch(
      // 1. Token-Mint
      {
        status: 200,
        ok: true,
        json: async () => ({ token: "tok", proxyUrl: "https://proxy.example" }),
      },
      // 2. Proxy-Anonymisierung
      {
        ok: true,
        json: async () => ({
          anonymized: {
            teilnahme: "Herr [NAME] nahm regelmäßig teil.",
            ablauf: "Bewerbungstraining in [ORT].",
            fazit: "Vermittlung wahrscheinlich.",
          },
          entities: [
            { type: "NAME", original: "Max Mustermann", placeholder: "[NAME]" },
            { type: "ORT", original: "Singen", placeholder: "[ORT]" },
          ],
        }),
      },
    );

    const result = await anonymize(INPUT);
    expect(result.bypassed).toBe(false);
    expect(result.anonymized.teilnahme).toContain("[NAME]");
    // Klartext-Name darf im Ergebnis, das an Azure geht, nicht mehr stehen.
    expect(result.anonymized.teilnahme).not.toContain("Mustermann");
    expect(result.entities).toHaveLength(2);
  });
});

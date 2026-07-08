import { describe, expect, it } from "vitest";

import { selectStorageProvider } from "./storage-provider";

/**
 * Regression zu PR #134: Storage darf in Production NICHT still auf den
 * öffentlichen Vercel-Blob-Fallback zurückfallen, wenn R2 nicht konfiguriert
 * ist. Der Fall-Katalog (docs/test-plan-access-control.md §G) verlangt genau
 * dieses Verhalten.
 */
describe("selectStorageProvider", () => {
  it("nutzt R2, sobald R2_ACCOUNT_ID gesetzt ist — unabhängig von NODE_ENV", () => {
    expect(
      selectStorageProvider({ r2AccountId: "acc-123", nodeEnv: "production" }),
    ).toBe("r2");
    expect(
      selectStorageProvider({ r2AccountId: "acc-123", nodeEnv: "development" }),
    ).toBe("r2");
  });

  it("WIRFT in Production, wenn R2 fehlt (kein stiller Public-Blob-Fallback)", () => {
    expect(() =>
      selectStorageProvider({ r2AccountId: undefined, nodeEnv: "production" }),
    ).toThrow(/Production/);
  });

  it("erlaubt den Vercel-Blob-Fallback außerhalb von Production", () => {
    expect(
      selectStorageProvider({ r2AccountId: undefined, nodeEnv: "development" }),
    ).toBe("vercel-blob");
    expect(
      selectStorageProvider({ r2AccountId: undefined, nodeEnv: "test" }),
    ).toBe("vercel-blob");
    // Vercel-Preview-Deployments laufen als NODE_ENV=production? Nein — der
    // Guard hängt bewusst an NODE_ENV, nicht an VERCEL_ENV. Ein leerer
    // nodeEnv (lokal ohne gesetzte Variable) fällt ebenfalls auf Blob.
    expect(selectStorageProvider({ r2AccountId: undefined })).toBe(
      "vercel-blob",
    );
  });

  it("behandelt leeren R2_ACCOUNT_ID-String wie 'nicht gesetzt'", () => {
    // process.env-Werte sind Strings; ein leerer String darf nicht als
    // 'konfiguriert' durchgehen.
    expect(() =>
      selectStorageProvider({ r2AccountId: "", nodeEnv: "production" }),
    ).toThrow(/Production/);
  });
});

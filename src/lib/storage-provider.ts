/**
 * Reine Entscheidungslogik, welcher Storage-Provider aktiv ist — bewusst
 * ausgelagert aus `storage.ts` (das `server-only` ist und AWS-SDK/@vercel/blob
 * importiert), damit die sicherheitsrelevante Prod-Guard-Regel ohne DB-/
 * server-only-Ballast unit-testbar bleibt (siehe vitest.config.ts-Scope).
 */

export type StorageProvider = "r2" | "vercel-blob";

/**
 * Wählt den Provider anhand der Umgebung:
 *  - R2 ist gesetzt → immer R2 (der Normalfall in Prod).
 *  - Kein R2, aber Production → **wirft**. Der Fallback auf öffentlichen
 *    Vercel Blob (`access: "public"`, 1-Jahr-CDN-Cache) darf in Prod NIE
 *    stillschweigend greifen: Signaturen/PDFs von Sozialleistungsempfängern
 *    dürfen nicht public erreichbar landen. Analog zum Fail-hard-Pattern in
 *    email.ts / sms.ts.
 *  - Kein R2, nicht Production (Dev/Preview/Test) → Vercel Blob als Fallback.
 */
export function selectStorageProvider(env: {
  r2AccountId?: string;
  nodeEnv?: string;
}): StorageProvider {
  if (env.r2AccountId) return "r2";
  if (env.nodeEnv === "production") {
    throw new Error(
      "Storage ist in Production nicht korrekt konfiguriert (R2_ACCOUNT_ID fehlt) — " +
        "der Fallback auf öffentlichen Vercel Blob ist in Prod deaktiviert.",
    );
  }
  return "vercel-blob";
}

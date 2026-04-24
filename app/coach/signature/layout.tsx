import { requireSigningEnabled } from "@/lib/dal";

export const dynamic = "force-dynamic";

/**
 * Gate für die Unterschrift-Erfassung. Coaches ohne `signing_enabled`
 * brauchen keine Signatur hinterlegt — sie nutzen nur den Checker.
 */
export default async function SignatureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSigningEnabled();
  return <>{children}</>;
}

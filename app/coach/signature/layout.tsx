import { requireCoach } from "@/lib/dal";

export const dynamic = "force-dynamic";

/**
 * Auch Coaches ohne `signing_enabled` brauchen eine Unterschrift, sobald sie
 * BER-PDFs aus dem Checker exportieren — ein Coach signiert seinen Bericht
 * digital. Daher Gate auf `requireCoach`, nicht mehr auf `requireSigningEnabled`.
 */
export default async function SignatureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCoach();
  return <>{children}</>;
}

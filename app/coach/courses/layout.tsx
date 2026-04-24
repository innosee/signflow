import { requireSigningEnabled } from "@/lib/dal";

export const dynamic = "force-dynamic";

/**
 * Gate für den Signatur-Flow. Coaches ohne `signing_enabled` werden hart
 * auf `/coach/checker` umgeleitet — der Checker ist unabhängig für alle
 * freigeschaltet. Siehe ROADMAP.md → „signing_enabled-Flag".
 */
export default async function CoursesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSigningEnabled();
  return <>{children}</>;
}

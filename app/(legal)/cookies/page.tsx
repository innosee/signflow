import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookie-Hinweis — Signflow",
  description:
    "Übersicht der von Signflow eingesetzten Cookies. Nur technisch notwendige Cookies für die Anmeldung.",
};

export default function CookiesPage() {
  return (
    <article className="space-y-10">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Rechtliches
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
          Cookie-Hinweis
        </h1>
        <p className="text-sm text-zinc-500">
          Welche Cookies Signflow setzt und warum wir keinen Consent-Banner
          anzeigen.
        </p>
      </header>

      <section className="space-y-3 text-sm leading-relaxed text-zinc-700">
        <p>
          Signflow setzt ausschließlich technisch notwendige Cookies ein. Diese
          sind für den Betrieb der Anwendung unverzichtbar — ohne sie können sich
          angemeldete Nutzer:innen nicht sicher über mehrere Seitenaufrufe hinweg
          ausweisen. Für solche Cookies ist gemäß § 25 Abs. 2 Nr. 2 TTDSG keine
          Einwilligung erforderlich, weshalb wir keinen Consent-Banner anzeigen.
        </p>
        <p>
          Tracking- oder Marketing-Cookies, Werbe-Pixel, Analyse-Dienste oder
          eingebundene Inhalte Dritter, die Cookies setzen könnten, verwenden wir
          nicht.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
          Eingesetzte Cookies
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Zweck</th>
                <th className="py-2 pr-4 font-medium">Speicherdauer</th>
                <th className="py-2 font-medium">Kategorie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-700">
              <tr>
                <td className="py-2 pr-4 align-top font-mono text-xs text-zinc-900">
                  better-auth.session_token
                </td>
                <td className="py-2 pr-4 align-top">
                  Hält die Anmeldung angemeldeter Bildungsträger- und Coach-Accounts
                  über mehrere Seitenaufrufe aufrecht.
                </td>
                <td className="py-2 pr-4 align-top">
                  Sitzung, maximal 7 Tage
                </td>
                <td className="py-2 align-top">Technisch notwendig</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
          Cookies löschen oder blockieren
        </h2>
        <p>
          Sie können Cookies in Ihrem Browser jederzeit löschen oder deren
          Speicherung verhindern. Wenn Sie den Session-Cookie blockieren, ist eine
          Anmeldung in Signflow nicht mehr möglich — die öffentliche Startseite
          bleibt weiterhin erreichbar.
        </p>
        <p>
          Weitere Informationen zur Datenverarbeitung finden Sie in unserer{" "}
          <Link
            href="/datenschutz"
            className="text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
          >
            Datenschutzerklärung
          </Link>
          .
        </p>
      </section>
    </article>
  );
}

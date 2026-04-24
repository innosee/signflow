import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Impressum — Signflow",
  description: "Anbieterkennzeichnung nach § 5 TMG und § 18 MStV.",
};

export default function ImpressumPage() {
  return (
    <article className="space-y-10">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Rechtliches
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
          Impressum
        </h1>
        <p className="text-sm text-zinc-500">
          Angaben gemäß § 5 TMG und § 18 MStV.
        </p>
      </header>

      <PlaceholderNotice />

      <Section title="Anbieter">
        <p>
          innosee GmbH
          <br />
          Bahnhofstraße 1
          <br />
          78351 Bodman-Ludwigshafen
          <br />
          Deutschland
        </p>
      </Section>

      <Section title="Vertretungsberechtigte Person">
        <p>Geschäftsführung: Benjamin Dennis Konopka</p>
      </Section>

      <Section title="Kontakt">
        <p>
          E-Mail:{" "}
          <a
            href="mailto:info@innosee.de"
            className="text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
          >
            info@innosee.de
          </a>
        </p>
      </Section>

      <Section title="Registereintrag">
        <p>
          Eintragung im Handelsregister.
          <br />
          Registergericht: Amtsgericht Freiburg im Breisgau
          <br />
          Registernummer: HRB 731688
        </p>
      </Section>

      <Section title="Umsatzsteuer-Identifikationsnummer">
        <p>
          Umsatzsteuer-ID nach § 27 a UStG:{" "}
          <Placeholder>DE…</Placeholder>
        </p>
      </Section>

      <Section title="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
        <p>
          Benjamin Dennis Konopka
          <br />
          Anschrift wie oben.
        </p>
      </Section>

      <Section title="EU-Streitschlichtung">
        <p>
          Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung
          (OS) bereit:{" "}
          <a
            href="https://ec.europa.eu/consumers/odr/"
            className="text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
            target="_blank"
            rel="noreferrer"
          >
            ec.europa.eu/consumers/odr
          </a>
          . Unsere E-Mail-Adresse finden Sie oben.
        </p>
        <p>
          Zur Teilnahme an einem Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle sind wir weder verpflichtet noch bereit.
        </p>
      </Section>

      <Section title="Haftung für Inhalte">
        <p>
          Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf
          diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach
          §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet,
          übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach
          Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
        </p>
      </Section>

      <Section title="Haftung für Links">
        <p>
          Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte
          wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte
          auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist
          stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.
        </p>
      </Section>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-zinc-700">
        {children}
      </div>
    </section>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-900">
      {children}
    </span>
  );
}

function PlaceholderNotice() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <strong className="font-semibold">Offen:</strong> Umsatzsteuer-ID vor
      Go-Live ergänzen. Alle übrigen Angaben entsprechen dem Handelsregistereintrag
      der innosee GmbH (HRB 731688, AG Freiburg).
    </div>
  );
}

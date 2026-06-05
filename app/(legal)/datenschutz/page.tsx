import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — Signflow",
  description:
    "Informationen zur Verarbeitung personenbezogener Daten nach Art. 13 DSGVO für Signflow (Signatur- und Checker-Modul).",
};

export default function DatenschutzPage() {
  return (
    <article className="space-y-10">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Rechtliches
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
          Datenschutzerklärung
        </h1>
        <p className="text-sm text-zinc-500">
          Informationen nach Art. 13 und 14 DSGVO zur Verarbeitung
          personenbezogener Daten bei der Nutzung von Signflow.
        </p>
      </header>

      <DraftNotice />

      <Section title="1. Verantwortlicher">
        <p>
          Verantwortlicher für den Betrieb dieser Website und der zentralen
          Plattformfunktionen ist:
        </p>
        <p>
          innosee GmbH
          <br />
          Bahnhofstraße 1
          <br />
          78351 Bodman-Ludwigshafen
          <br />
          Deutschland
          <br />
          E-Mail:{" "}
          <a
            href="mailto:info@innosee.de"
            className="text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
          >
            info@innosee.de
          </a>
        </p>
        <p>
          Weitere Angaben finden Sie im{" "}
          <Link
            href="/impressum"
            className="text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
          >
            Impressum
          </Link>
          .
        </p>
        <p>
          <Placeholder>
            Multi-Tenant-Kontext: Signflow wird seit 2026-05-05 mehrmandantenfähig
            betrieben. Für Kurs-, Sitzungs- und Teilnehmerdaten ist in der Regel
            der jeweilige Bildungsträger Verantwortlicher; innosee GmbH handelt
            insoweit als Auftragsverarbeiterin nach Art. 28 DSGVO. Die genaue
            Abgrenzung (Joint Controllership vs. AV) muss durch die
            DSGVO-Beratung formuliert und je Bildungsträger per AVV bestätigt
            werden.
          </Placeholder>
        </p>
      </Section>

      <Section title="2. Datenschutzbeauftragte:r">
        <p>
          <Placeholder>
            Benennung eines:r Datenschutzbeauftragten ist bei regelmäßiger
            Verarbeitung von Art.-9-Daten (Abschlussbericht-Checker) wahrscheinlich
            Pflicht. Namens- und Kontaktangabe hier vor Go-Live ergänzen.
          </Placeholder>
        </p>
      </Section>

      <Section title="3. Gegenstand und Module">
        <p>
          Signflow wird als zwei funktional getrennte Module betrieben. Für beide
          gelten unterschiedliche Datenkategorien und Rechtsgrundlagen. Wir
          beschreiben sie deshalb separat.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Signatur-Modul</strong> — digitale Erfassung und elektronische
            Signatur von Anwesenheitsnachweisen für AVGS-Maßnahmen.
          </li>
          <li>
            <strong>Abschlussbericht-Checker</strong> — KI-gestützte Regelprüfung
            von AVGS-Abschlussberichten mit vorgeschalteter Anonymisierung.
          </li>
        </ul>
      </Section>

      <Section title="4. Verarbeitungen im Signatur-Modul">
        <Subsection title="4.1 Zwecke">
          <ul className="list-disc space-y-1 pl-5">
            <li>Durchführung und Dokumentation von AVGS-Maßnahmen</li>
            <li>
              Erfassung und elektronische Signatur von Stundennachweisen durch
              Coach und Teilnehmer:in
            </li>
            <li>
              Versand zeitlich begrenzter Magic Links per E-Mail oder optional
              per SMS zur Authentifizierung der Teilnehmer:innen für die Signatur
            </li>
            <li>
              Versiegelung des Gesamtdokuments mit einer fortgeschrittenen
              elektronischen Signatur (FES) und Übermittlung an die Agentur für
              Arbeit
            </li>
          </ul>
        </Subsection>
        <Subsection title="4.2 Datenkategorien">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Stammdaten (Name, E-Mail-Adresse, Kunden-Nr. der Teilnehmer:innen,
              optional Mobilnummer für SMS-Versand)
            </li>
            <li>Kurs- und Sitzungsdaten (Termine, Themen, Unterrichtseinheiten)</li>
            <li>Unterschriftsbilder (Canvas-Eingabe, als Bilddatei gespeichert)</li>
            <li>
              Signatur-Metadaten (IP-Adresse, Zeitstempel, Rolle) als Audit-Log
            </li>
            <li>
              Bei SMS-Zustellung zusätzlich: Mobilnummer (E.164), Vorname zur
              Anrede, Kursbezeichnung sowie der Magic-Link selbst — als
              Bestandteil des SMS-Textes an den Versanddienstleister
            </li>
          </ul>
        </Subsection>
        <Subsection title="4.3 Rechtsgrundlagen">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung bzw. vorvertragliche
              Maßnahmen) für die Durchführung der Maßnahme
            </li>
            <li>
              Art. 6 Abs. 1 lit. c DSGVO (rechtliche Verpflichtung) für die
              Dokumentations- und Nachweispflichten gegenüber der Agentur für Arbeit
            </li>
          </ul>
        </Subsection>
        <Subsection title="4.4 FES-Zertifikat (Aussteller)">
          <p>
            Für die fortgeschrittene elektronische Versiegelung wird ein
            qualifiziertes Zertifikat eines eIDAS-akkreditierten
            Vertrauensdiensteanbieters genutzt (
            <Placeholder>
              geplanter Anbieter: D-Trust GmbH, Berlin — Bundesdruckerei-Gruppe;
              vor Live-Schaltung bestätigen
            </Placeholder>
            ). Der Anbieter erhält weder die zu siegelnden Dokumente noch
            Inhalte daraus; das Siegel wird server-seitig in der
            Infrastruktur der innosee GmbH auf das fertige PDF angewendet.
            Im Rahmen der Zertifikats-Ausstellung werden lediglich
            Unternehmensstammdaten (Handelsregister, Geschäftsführer-
            Identifizierung) an den Aussteller übermittelt.
          </p>
        </Subsection>
      </Section>

      <Section title="5. Verarbeitungen im Abschlussbericht-Checker">
        <Subsection title="5.1 Zwecke">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Automatisierte Prüfung von AVGS-Abschlussberichten gegen
              Qualitäts- und Formvorgaben der Bildungsträgerin
            </li>
            <li>
              Live-Feedback zu verbotenen Begriffen, fehlenden Pflichtangaben und
              stilistischen Problemen während des Schreibens
            </li>
          </ul>
        </Subsection>
        <Subsection title="5.2 Datenkategorien">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Berichtsinhalte, die im Einzelfall besondere Kategorien
              personenbezogener Daten i.S.d. Art. 9 DSGVO (Gesundheitsdaten)
              enthalten können
            </li>
            <li>Sozialdaten im Kontext der Arbeitsförderung nach SGB III</li>
            <li>
              Nach Einreichung: ausschließlich regelkonforme Berichtstexte ohne
              besondere Kategorien (harter Freigabe-Gate)
            </li>
          </ul>
        </Subsection>
        <Subsection title="5.3 Rechtsgrundlagen">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Art. 9 Abs. 2 lit. b DSGVO i.V.m. § 22 Abs. 1 Nr. 1 lit. b BDSG
              (Pflichten aus dem Recht der sozialen Sicherheit) für den
              Prüfvorgang selbst
            </li>
            <li>
              Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) für die Speicherung
              freigegebener Berichte
            </li>
          </ul>
        </Subsection>
        <Subsection title="5.4 Technische und organisatorische Schutzmaßnahmen">
          <p>
            Rohtexte von Berichten werden ausschließlich im Browser der
            bearbeitenden Person sowie auf einer dedizierten Compute-VM bei der
            IONOS SE in Deutschland verarbeitet. Dort erfolgt eine dreistufige
            Anonymisierung (Regex, lokales GLiNER-Modell, IONOS AI Model Hub).
            Erst die anonymisierte Fassung wird an weitere Verarbeiter
            weitergeleitet. Rohtexte werden nicht persistent gespeichert.
          </p>
        </Subsection>
      </Section>

      <Section title="6. Empfänger und Auftragsverarbeiter">
        <p>
          Wir setzen sorgfältig ausgewählte Dienstleister ein. Mit allen Empfängern
          bestehen Auftragsverarbeitungsverträge nach Art. 28 DSGVO. Für Empfänger
          in Drittländern bestehen zusätzlich EU-Standardvertragsklauseln (SCCs).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Empfänger</th>
                <th className="py-2 pr-4 font-medium">Zweck</th>
                <th className="py-2 font-medium">Region</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-700">
              <ProcessorRow
                name="Vercel Inc."
                purpose="Hosting der Anwendung"
                region="EU (Frankfurt), Unternehmenssitz USA — SCCs"
              />
              <ProcessorRow
                name="Neon Inc."
                purpose="Datenbank (Kurse, Sitzungen, Audit-Log)"
                region="EU (AWS Frankfurt), Unternehmenssitz USA — SCCs"
              />
              <ProcessorRow
                name="Cloudflare, Inc."
                purpose="Objekt-Storage (R2) für Unterschriftsbilder, Logos und gesiegelte PDFs; privater Bucket, Zugriff nur über kurzlebige signierte URLs"
                region="EU-Jurisdiction (Frankfurt/Amsterdam), Unternehmenssitz USA — SCCs"
              />
              <ProcessorRow
                name="Resend Inc."
                purpose="Versand transaktionaler E-Mails (Magic Links, Einladungen)"
                region="EU, Unternehmenssitz USA — SCCs"
              />
              <ProcessorRow
                name="Sieben Communications GmbH (seven.io / sms77)"
                purpose="Versand von Magic-Link-SMS an Teilnehmer:innen, sofern für diesen Zustellweg eine Mobilnummer hinterlegt und der Channel vom Coach gewählt wurde. Auftragsverarbeitungsvertrag nach Art. 28 DSGVO geschlossen; Verarbeitung ausschließlich in einem ISO 27001 zertifizierten Rechenzentrum in Deutschland"
                region="Deutschland (Köln)"
              />
              <ProcessorRow
                name="IONOS SE"
                purpose="Compute-VM und AI Model Hub für die Anonymisierung (nur Checker)"
                region="Deutschland"
              />
              <ProcessorRow
                name="Microsoft Ireland Operations Ltd. (Azure OpenAI)"
                purpose="Regelprüfung auf anonymisiertem Text (nur Checker)"
                region="EU (Sweden Central oder Germany West Central) — SCCs"
              />
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="7. Speicherdauer">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Kurs-, Sitzungs- und Signaturdaten: bis zur Erfüllung der maßnahmen-
            und steuerrechtlichen Aufbewahrungspflichten (in der Regel bis zu
            10 Jahre)
          </li>
          <li>
            Unterschriftsbilder: zusammen mit dem zugehörigen Kurs; nach Ablauf
            der Aufbewahrungspflicht Löschung
          </li>
          <li>
            Rohberichte im Checker-Modul: transient im Browser bzw. RAM der
            Anonymisierungs-VM, keine persistente Speicherung
          </li>
          <li>
            Freigegebene Berichtsinhalte (nach Regelprüfung): bis zum Ende der
            Dokumentationspflicht, danach Löschung
          </li>
          <li>
            Audit-Log-Einträge: in der Regel 12 Monate, soweit keine längere
            gesetzliche Aufbewahrungspflicht besteht
          </li>
          <li>
            Versandprotokolle des SMS-Dienstleisters (Mobilnummer,
            Zustellstatus, Zeitpunkt): beim Auftragsverarbeiter standardmäßig
            bis zu 30 Tage, anschließend automatische Löschung; SMS-Inhalte
            werden über den eigentlichen Versandvorgang hinaus nicht
            gespeichert
          </li>
        </ul>
      </Section>

      <Section title="8. Betroffenenrechte">
        <p>
          Sie haben gegenüber uns die folgenden Rechte hinsichtlich der Sie
          betreffenden personenbezogenen Daten:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Recht auf Auskunft (Art. 15 DSGVO)</li>
          <li>Recht auf Berichtigung (Art. 16 DSGVO)</li>
          <li>Recht auf Löschung (Art. 17 DSGVO)</li>
          <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
          <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</li>
          <li>Widerspruchsrecht (Art. 21 DSGVO)</li>
          <li>
            Recht auf Widerruf einer Einwilligung für die Zukunft, soweit eine
            solche erteilt wurde (Art. 7 Abs. 3 DSGVO)
          </li>
        </ul>
        <p>
          Zur Ausübung Ihrer Rechte genügt eine formlose Nachricht an die oben
          genannte E-Mail-Adresse.
        </p>
      </Section>

      <Section title="9. Beschwerderecht bei einer Aufsichtsbehörde">
        <p>
          Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu
          beschweren (Art. 77 DSGVO). Zuständig ist insbesondere die
          Aufsichtsbehörde am Sitz des Verantwortlichen:
        </p>
        <p>
          Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit
          Baden-Württemberg
          <br />
          Lautenschlagerstraße 20
          <br />
          70173 Stuttgart
          <br />
          <a
            href="https://www.baden-wuerttemberg.datenschutz.de"
            className="text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
            target="_blank"
            rel="noreferrer"
          >
            baden-wuerttemberg.datenschutz.de
          </a>
        </p>
      </Section>

      <Section title="10. Cookies">
        <p>
          Wir setzen ausschließlich technisch notwendige Cookies zur
          Aufrechterhaltung der Sitzung angemeldeter Nutzer:innen ein. Details
          finden Sie unter{" "}
          <Link
            href="/cookies"
            className="text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
          >
            Cookie-Hinweis
          </Link>
          .
        </p>
      </Section>

      <Section title="11. Automatisierte Entscheidungsfindung">
        <p>
          Eine automatisierte Entscheidungsfindung einschließlich Profiling nach
          Art. 22 DSGVO findet nicht statt. Die Regelprüfung im Abschlussbericht-
          Checker erzeugt Hinweise, ersetzt aber nicht die inhaltliche Prüfung
          durch den Coach bzw. die Bildungsträgerin.
        </p>
      </Section>

      <Section title="12. Änderungen dieser Erklärung">
        <p>
          Wir passen diese Datenschutzerklärung bei Änderungen der Verarbeitung
          oder der rechtlichen Rahmenbedingungen an. Maßgeblich ist die jeweils
          unter dieser Adresse abrufbare Fassung.
        </p>
        <p className="text-xs text-zinc-500">
          Stand: 5. Juni 2026 (Entwurf)
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

function Subsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {children}
    </div>
  );
}

function ProcessorRow({
  name,
  purpose,
  region,
}: {
  name: string;
  purpose: string;
  region: React.ReactNode;
}) {
  return (
    <tr>
      <td className="py-2 pr-4 align-top font-medium text-zinc-900">{name}</td>
      <td className="py-2 pr-4 align-top">{purpose}</td>
      <td className="py-2 align-top text-zinc-600">{region}</td>
    </tr>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-900">
      {children}
    </span>
  );
}

function DraftNotice() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <strong className="font-semibold">Entwurf — noch nicht freigegeben.</strong>{" "}
      Dieser Text spiegelt den technischen Aufbau korrekt wider, ersetzt aber keine
      rechtliche Prüfung. Vor dem Go-Live müssen die gelb markierten Felder
      ausgefüllt und die Formulierungen durch eine:n DSB bzw. DSGVO-Berater:in
      abgenommen werden. Art.-9-Spezifika des Abschlussbericht-Checkers werden in
      Generator-Templates erfahrungsgemäß nicht sauber abgebildet.
    </div>
  );
}

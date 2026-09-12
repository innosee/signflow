import type { Metadata } from "next";
import Link from "next/link";

import { legal } from "@/lib/legal";

const { company, supervisoryAuthority, dataProtectionOfficer } = legal;

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

      <Section title="1. Verantwortlicher">
        <p>
          Verantwortlicher für den Betrieb dieser Website und der zentralen
          Plattformfunktionen ist:
        </p>
        <p>
          {company.name}
          <br />
          {company.street}
          <br />
          {company.zipCity}
          <br />
          {company.country}
          <br />
          E-Mail:{" "}
          <a
            href={`mailto:${company.email}`}
            className="text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
          >
            {company.email}
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
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="font-semibold text-zinc-900">
            Hinweis für Teilnehmer:innen und Coaches
          </p>
          <p className="mt-2">
            Signflow wird von Bildungsträgern genutzt, um ihre Maßnahmen zu
            dokumentieren. Für alle Daten, die ein Bildungsträger in Signflow
            verarbeitet — insbesondere zu Teilnehmer:innen, Coaches, Maßnahmen,
            Terminen, Unterschriften und Dokumenten — ist{" "}
            <strong>der jeweilige Bildungsträger Verantwortlicher</strong>. Die{" "}
            {company.name} verarbeitet diese Daten ausschließlich in dessen
            Auftrag und nach dessen Weisung als Auftragsverarbeiterin (Art. 28
            DSGVO) auf Grundlage eines Auftragsverarbeitungsvertrags. Sie nutzt
            die Daten nicht für eigene Zwecke.
          </p>
          <p className="mt-2">
            Welche Daten Ihr Bildungsträger zu welchen Zwecken verarbeitet,
            erfahren Sie aus dessen Datenschutzhinweisen; Anfragen zu Ihren
            Rechten richten Sie bitte an ihn (siehe Ziffer 8). Die Abschnitte 4
            und 5 beschreiben, wie Signflow diese Daten technisch verarbeitet.
          </p>
        </div>
        <p>
          Eigenverantwortlich verarbeitet die {company.name} nur Daten zum
          Betrieb dieser Website sowie zur Vertragsbeziehung mit den
          Bildungsträgern (z.&nbsp;B. Registrierung, Warteliste, Support).
        </p>
      </Section>

      <Section
        title={
          dataProtectionOfficer
            ? "2. Datenschutzbeauftragte:r"
            : "2. Kontakt in Datenschutzfragen"
        }
      >
        {dataProtectionOfficer ? (
          <p>
            {dataProtectionOfficer.name}
            <br />
            {dataProtectionOfficer.address}
            <br />
            E-Mail:{" "}
            <a
              href={`mailto:${dataProtectionOfficer.email}`}
              className="text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
            >
              {dataProtectionOfficer.email}
            </a>
          </p>
        ) : (
          <p>
            Fragen zum Datenschutz bei Signflow richten Sie bitte an{" "}
            <a
              href={`mailto:${company.email}`}
              className="text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
            >
              {company.email}
            </a>
            .
          </p>
        )}
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
            von AVGS-Abschlussberichten mit vorgeschalteter Pseudonymisierung.
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
              Elektronische Signatur der Nachweise (einfache elektronische
              Signatur: Canvas-Unterschrift mit Zeitstempel, IP-Adresse und
              Audit-Protokoll) und Bereitstellung der finalen Nachweise zur
              Vorlage bei der Agentur für Arbeit durch den Bildungsträger.
            </li>
            <li>
              Erstellung und elektronische Signatur von Kundendokumenten des
              Bildungsträgers (z.&nbsp;B. Teilnehmervertrag,
              Strategievereinbarung, Teilnahmebescheinigung)
            </li>
          </ul>
        </Subsection>
        <Subsection title="4.2 Datenkategorien">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Stammdaten der Teilnehmer:innen (Name, E-Mail-Adresse,
              Kundennummer der Agentur für Arbeit, optional Mobil- und
              Festnetznummer); für Kundendokumente zusätzlich Anschrift sowie
              optional Geburtsdatum und Geburtsort
            </li>
            <li>
              Maßnahmedaten (Maßnahmentyp, AVGS-Nummer, Bedarfsträger,
              Zeitraum, bewilligte und geleistete Unterrichtseinheiten,
              Durchführungsort)
            </li>
            <li>
              Termindaten (Datum, Unterrichtseinheiten, Präsenz/Online,
              Themen-Stichworte), beim Erstgespräch die Eignungsanalyse sowie
              gegebenenfalls der Vermerk einer krankheitsbedingten Absage
              (siehe Ziffer 4.6)
            </li>
            <li>
              Inhalte der Kundendokumente und Abschlussberichte, einschließlich
              des Integrationsergebnisses (z.&nbsp;B. Vermittlung mit Datum und
              Arbeitgeber)
            </li>
            <li>
              Daten der Coaches und Mitarbeitenden des Bildungsträgers (Name,
              E-Mail-Adresse, Rolle, Unterschriftsbild, Anmeldedaten)
            </li>
            <li>Unterschriftsbilder (Canvas-Eingabe, als Bilddatei gespeichert)</li>
            <li>
              Signatur-Metadaten (IP-Adresse, Zeitstempel, Rolle) als Audit-Log;
              diese Metadaten werden zur Beweissicherung der einfachen
              elektronischen Signatur auch als Audit-Trail auf dem finalen
              Nachweis-Dokument (PDF) ausgewiesen
            </li>
            <li>
              Unterschriftsbilder und finale PDF-Nachweise werden in einem
              privaten EU-Objektspeicher abgelegt; der Zugriff erfolgt
              ausschließlich über kurzlebige signierte URLs
            </li>
            <li>
              Bei SMS-Zustellung zusätzlich: Mobilnummer (E.164), Vorname zur
              Anrede, Kursbezeichnung sowie der Magic-Link selbst — als
              Bestandteil des SMS-Textes an den Versanddienstleister
            </li>
          </ul>
        </Subsection>
        <Subsection title="4.3 Rechtsgrundlagen">
          <p>
            Die Verarbeitung erfolgt im Auftrag des Bildungsträgers auf dessen
            Rechtsgrundlagen, insbesondere:
          </p>
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
        <Subsection title="4.4 Gültigkeit und Absicherung der Magic Links">
          <p>
            Die zur Signatur versandten Magic Links sind ab Ausstellung{" "}
            <strong>7 Tage</strong> gültig und werden danach automatisch
            ungültig. Die Geltungsdauer ist bewusst an der praktischen
            Erreichbarkeit der Teilnehmer:innen ausgerichtet und im Sinne der
            Datenminimierung (Art. 5 Abs. 1 lit. c DSGVO) auf ein
            verhältnismäßiges, nicht unnötig langes Fenster begrenzt.
          </p>
          <p>
            Der Zugriff ist zusätzlich durch geeignete technische Maßnahmen nach
            Art. 32 DSGVO abgesichert: Der Token wird ausschließlich als
            kryptographischer Hash (SHA-256) gespeichert – der Klartext ist uns
            nicht bekannt –, gilt nur für genau einen Kurs und eine:n
            bestimmte:n Teilnehmer:in, und jede Signatur erfordert eine aktive
            Bestätigung, die mit Zeitstempel und IP-Adresse im Audit-Protokoll
            festgehalten wird.
          </p>
        </Subsection>
        <Subsection title="4.5 KI-gestützter ANW-Compliance-Check">
          <p>
            Vor der Freigabe eines Nachweises kann der Coach optional einen
            KI-gestützten Compliance-Check auslösen. Dabei werden die
            stichwortartigen Termin-Einträge der Anwesenheitsliste auf
            AZAV-Konformität und inhaltliche Plausibilität geprüft. Zu diesem
            Zweck werden folgende Daten an unseren Auftragsverarbeiter{" "}
            <strong>Microsoft (Azure OpenAI Service, EU-Region)</strong>{" "}
            übermittelt:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>der Maßnahmentyp und die Bezeichnung der Bildungsträgerin,</li>
            <li>
              je Termin: Datum, Anzahl der Unterrichtseinheiten und der vom Coach
              eingetragene Themen-Stichworttext.
            </li>
          </ul>
          <p>
            <strong>Nicht</strong> übermittelt werden Stammdaten der
            Teilnehmer:innen (Name, E-Mail, Kunden-Nr.), Unterschriftsbilder oder
            Signatur-Metadaten. Anders als beim Abschlussbericht-Checker (Ziffer 5)
            werden die Termin-Stichworte <strong>nicht pseudonymisiert</strong>, da es
            sich um kurze, sachbezogene Themenangaben ohne Personenbezug handelt;
            Coaches sind angehalten, in diese Felder keine Klarnamen oder sensiblen
            Angaben einzutragen. Die Übermittlung erfolgt an ein Rechenzentrum in
            der EU auf Grundlage eines Auftragsverarbeitungsvertrags mit Microsoft
            samt EU-Standardvertragsklauseln (vgl. Ziffer 6). Die Prüf-Ergebnisse
            werden nur temporär zur Anzeige verarbeitet und{" "}
            <strong>nicht dauerhaft gespeichert</strong>.
          </p>
          <p>
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
            an der Qualitätssicherung und AZAV-Konformität der Nachweise). Der
            Check hat rein unterstützenden Charakter; die Entscheidung über den
            Nachweis trifft stets der Coach.
          </p>
        </Subsection>
        <Subsection title="4.6 Vermerk krankheitsbedingter Absagen (Gesundheitsdaten)">
          <p>
            Sagt ein:e Teilnehmer:in einen Termin krankheitsbedingt ab, kann der
            Coach den Termin als &bdquo;krankheitsbedingt abgesagt&ldquo; vermerken. Der
            Termin wird dann mit 0 Unterrichtseinheiten ausgewiesen und muss
            nicht unterschrieben werden; der Vermerk erscheint auch auf dem
            finalen Nachweis. Weil er Rückschlüsse auf eine Erkrankung zulässt,
            handelt es sich um ein Gesundheitsdatum im Sinne von Art. 9 DSGVO.
            Erfasst wird ausschließlich die Tatsache der krankheitsbedingten
            Absage — keine Diagnose, keine Krankschreibung und keine weiteren
            Angaben zum Gesundheitszustand.
          </p>
          <p>
            Rechtsgrundlage ist Art. 9 Abs. 2 lit. b DSGVO i.V.m. § 22 Abs. 1
            Nr. 1 lit. a BDSG (Rechte und Pflichten aus dem Recht der sozialen
            Sicherheit, hier die Dokumentation der Maßnahme gegenüber der
            Agentur für Arbeit).
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
              Vor der Einreichung werden als sensibel erkannte Stellen
              (mögliche Angaben besonderer Kategorien) automatisch markiert und
              müssen entweder entfernt oder — im Fall eines Fehlalarms — mit
              einer dokumentierten Begründung gekennzeichnet werden; diese
              Begründung wird der Bildungsträgerin zur inhaltlichen Prüfung
              angezeigt. Die abschließende Verantwortung für die Freiheit der
              eingereichten Berichte von Art.-9-Daten liegt beim Coach und der
              prüfenden Bildungsträgerin.
            </li>
          </ul>
        </Subsection>
        <Subsection title="5.3 Rechtsgrundlagen">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Art. 9 Abs. 2 lit. b DSGVO i.V.m. § 22 Abs. 1 Nr. 1 lit. a BDSG
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
            IONOS SE in Deutschland verarbeitet. Dort erfolgt eine dreistufige{" "}
            <strong>Pseudonymisierung</strong> (Mustererkennung, lokales
            Erkennungsmodell GLiNER, IONOS AI Model Hub): Namen, Anschriften,
            Datumsangaben und andere identifizierende Angaben werden durch
            Platzhalter ersetzt. Die Zuordnung der Platzhalter zu den
            Originalangaben verbleibt im Browser der bearbeitenden Person; sie
            wird weder an Microsoft übermittelt noch von uns gespeichert.
          </p>
          <p>
            Erst die pseudonymisierte Fassung wird an Microsoft (Azure OpenAI
            Service, EU-Region) zur Regelprüfung übermittelt. Weil die Zuordnung
            technisch wiederhergestellt werden kann, gelten auch
            pseudonymisierte Texte weiterhin als personenbezogene Daten; die
            Übermittlung ist deshalb durch den Auftragsverarbeitungsvertrag mit
            Microsoft abgesichert (vgl. Ziffer 6). Microsoft verwendet die
            Eingaben nicht zum Training von KI-Modellen. Rohtexte werden nicht
            dauerhaft gespeichert.
          </p>
        </Subsection>
      </Section>

      <Section title="6. Empfänger und Auftragsverarbeiter">
        <p>
          Wir setzen sorgfältig ausgewählte Dienstleister ein. Mit unseren
          Auftragsverarbeitern schließen wir Verträge nach Art. 28 DSGVO ab.
        </p>
        <p>
          Die Daten werden in Rechenzentren in der EU gespeichert und
          verarbeitet. Einige Dienstleister haben ihren Unternehmenssitz in den
          USA; ein Zugriff von dort lässt sich deshalb nicht vollständig
          ausschließen. Für diesen Fall stützen wir uns auf den
          Angemessenheitsbeschluss der EU-Kommission zum EU-US Data Privacy
          Framework, soweit der Dienstleister danach zertifiziert ist, und
          ergänzend auf die EU-Standardvertragsklauseln (SCCs).
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
              {legal.subprocessors.map((p) => (
                <ProcessorRow
                  key={p.name}
                  name={p.name}
                  purpose={p.purpose}
                  region={p.region}
                />
              ))}
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
            Pseudonymisierungs-VM, keine persistente Speicherung
          </li>
          <li>
            Freigegebene Berichtsinhalte (nach Regelprüfung): bis zum Ende der
            Dokumentationspflicht, danach Löschung
          </li>
          <li>
            Zugriffstoken für die Signatur (Magic Links): ab Ausstellung
            7 Tage gültig, danach automatisch ungültig. Gespeichert wird
            ausschließlich ein kryptographischer Hash des Tokens, nicht der
            versandte Link selbst. Abgelaufene Token-Datensätze werden
            30 Tage nach Ablauf durch eine tägliche automatische
            Löschroutine entfernt.
          </li>
          <li>
            Audit-Log-Einträge: 12 Monate, danach automatische Löschung
            durch eine tägliche Löschroutine. Ausgenommen sind
            signaturbezogene Einträge (z.&nbsp;B. Freigaben durch
            Teilnehmende, Prüfung und Abschluss des Nachweises,
            Übermittlung an die Agentur für Arbeit sowie nachträgliche
            Änderungen an signierten Terminen) — diese tragen den
            Beweiswert des Anwesenheitsnachweises und werden wie dieser
            bis zur Erfüllung der gesetzlichen Aufbewahrungspflichten
            gespeichert.
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
        <p>
          <strong>Teilnehmer:innen und Coaches</strong> wenden sich mit Anliegen
          zu Daten, die ein Bildungsträger in Signflow verarbeitet, bitte an
          diesen Bildungsträger als Verantwortlichen (siehe Ziffer 1). Erreicht
          uns eine solche Anfrage, leiten wir sie unverzüglich an den
          Bildungsträger weiter und unterstützen ihn bei der Beantwortung, zum
          Beispiel bei Auskunft oder Löschung.
        </p>
      </Section>

      <Section title="9. Beschwerderecht bei einer Aufsichtsbehörde">
        <p>
          Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu
          beschweren (Art. 77 DSGVO). Zuständig ist insbesondere die
          Aufsichtsbehörde am Sitz des Verantwortlichen:
        </p>
        <p>
          {supervisoryAuthority.name}
          <br />
          {supervisoryAuthority.street}
          <br />
          {supervisoryAuthority.zipCity}
          <br />
          <a
            href={supervisoryAuthority.url}
            className="text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
            target="_blank"
            rel="noreferrer"
          >
            {supervisoryAuthority.url.replace(/^https?:\/\//, "")}
          </a>
        </p>
      </Section>

      <Section title="10. Reichweitenmessung und Bot-Schutz">
        <Subsection title="10.1 Cookielose Reichweitenmessung">
          <p>
            Zur anonymen Messung der Nutzung (Seitenaufrufe) setzen wir eine
            selbst betriebene, cookielose Analytik ein, die auf unserer eigenen
            Hosting-Infrastruktur (Vercel) läuft. Es werden keine Cookies
            gesetzt, keine geräteübergreifenden Profile gebildet und keine
            Daten an Werbe- oder Tracking-Netzwerke weitergegeben. Auf den
            Signatur-Seiten der Teilnehmer:innen (Magic-Link-Bereich) ist die
            Messung vollständig deaktiviert. Suchbegriffe (z.B. Namen in der
            Kundensuche) werden nie übertragen. Rechtsgrundlage ist unser
            berechtigtes Interesse an der bedarfsgerechten Weiterentwicklung
            der Anwendung (Art. 6 Abs. 1 lit. f DSGVO).
          </p>
        </Subsection>
        <Subsection title="10.2 Bot-Schutz (Cloudflare Turnstile)">
          <p>
            Zum Schutz der Registrierungs- und Wartelisten-Formulare vor
            automatisiertem Missbrauch setzen wir Cloudflare Turnstile ein
            (Cloudflare, Inc.). Beim Laden dieser Formulare wird eine
            Verbindung zu Cloudflare aufgebaut; dabei werden technisch bedingt
            die IP-Adresse und Browser-Informationen an Cloudflare übermittelt,
            um zwischen menschlichen Nutzer:innen und Bots zu unterscheiden.
            Turnstile setzt auf unserer Domain keine eigenen Cookies.
            Rechtsgrundlage ist unser berechtigtes Interesse am Schutz der
            Plattform vor Missbrauch (Art. 6 Abs. 1 lit. f DSGVO).
          </p>
        </Subsection>
      </Section>

      <Section title="11. Cookies">
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

      <Section title="12. Automatisierte Entscheidungsfindung">
        <p>
          Eine automatisierte Entscheidungsfindung einschließlich Profiling nach
          Art. 22 DSGVO findet nicht statt. Die Regelprüfung im Abschlussbericht-
          Checker erzeugt Hinweise, ersetzt aber nicht die inhaltliche Prüfung
          durch den Coach bzw. die Bildungsträgerin.
        </p>
      </Section>

      <Section title="13. Änderungen dieser Erklärung">
        <p>
          Wir passen diese Datenschutzerklärung bei Änderungen der Verarbeitung
          oder der rechtlichen Rahmenbedingungen an. Maßgeblich ist die jeweils
          unter dieser Adresse abrufbare Fassung.
        </p>
        <p className="text-xs text-zinc-500">
          Stand: {legal.lastUpdated}
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

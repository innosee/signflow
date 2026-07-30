import {
  DocField,
  DocumentFrame,
  formatDate,
  SignatureLine,
} from "@/components/documents/document-frame";
import type { DocumentSheetData } from "@/components/documents/types";
import type { ReactNode } from "react";

/**
 * F 08 — Teilnehmervertrag & Teilnahmevereinbarung (AVGS-Einzelcoaching,
 * § 45 SGB III), Stand 2026. Persönliche Stammdaten + Maßnahmedaten +
 * Vertrags-, Hausordnungs- und Datenschutzbestimmungen (die frühere separate
 * Datenschutzerklärung F04 ist in Abschnitt 9 aufgegangen). Zwei Unterschriften
 * (Teilnehmer:in + erango GmbH; erango zuerst).
 */
export function F08Teilnehmervertrag({ data }: { data: DocumentSheetData }) {
  const p = data.participant;
  const f = data.formData;
  return (
    <DocumentFrame
      formNumber="F 08"
      revision="Stand: 2026"
      title="Teilnehmervertrag & Teilnahmevereinbarung"
      subtitle="AVGS-Einzelcoaching (§ 45 SGB III)"
      logoUrl={data.branding.logoUrl}
    >
      <p className="doc-small">
        Vertragspartner sind die <strong>erango GmbH</strong> (nachfolgend
        &bdquo;Träger&ldquo;) und nachfolgende/r{" "}
        <strong>Teilnehmer/in</strong> (nachfolgend &bdquo;TN&ldquo;):
      </p>

      <SectionHeading n="1" title="Personalien des Teilnehmenden (TN)" />
      <DocField label="Name:" value={p.nachname} />
      <DocField label="Vorname:" value={p.vorname} />
      <DocField label="Straße / Nr.:" value={p.strasse} />
      <DocField
        label="PLZ, Ort:"
        value={[p.plz, p.ort].filter(Boolean).join(" ")}
      />
      <DocField label="Geburtsdatum:" value={formatDate(p.geburtsdatum)} />
      <DocField label="Geburtsort:" value={p.geburtsort} />
      <DocField label="Festnetz:" value={p.festnetz} />
      <DocField label="Mobil:" value={p.phone} />
      <DocField label="E-Mail-Adresse:" value={p.email} />

      <SectionHeading n="2" title="Angaben zur Maßnahme" />
      <DocField label="Bezeichnung der Maßnahme:" value={f.massnahme} />
      <DocField label="Maßnahmeort / Durchführungsform:" value={f.ort} />
      <DocField label="Gesamtumfang (UE):" value={f.anzahlUe} />
      <DocField label="Wöchentlicher Umfang:" value={f.ueProWoche} />
      <DocField label="Maßnahmebeginn:" value={formatDate(f.beginn)} />
      <DocField label="Voraussichtliches Ende:" value={formatDate(f.voraussEnde)} />

      <div className="doc-small">
        <SectionHeading n="3" title="Präambel & Maßnahmekosten" />
        <p>
          Die Maßnahmen systemisches Karrierecoaching (EKC), Systemisches
          Coaching (ESC), Gründungscoaching (EGC) sowie Systemisches
          Stabilisierungscoaching für Arbeitnehmer / Probezeitbegleitung (ESCA)
          der erango GmbH sind durch die fachkundige Stelle CERTQUA (von der
          DAkkS anerkannte Zertifizierungsstelle) nach dem Recht der
          Arbeitsförderung (AZAV) zugelassen. Die Maßnahmekosten sind mit der
          Zulassung festgeschrieben und betragen:
        </p>
        <ul>
          <li>
            <strong>EKC / ESC:</strong> 72,34 € pro Unterrichtseinheit
          </li>
          <li>
            <strong>EGC:</strong> 97,04 € pro Unterrichtseinheit
          </li>
          <li>
            <strong>ESCA:</strong> 75,46 € pro Unterrichtseinheit
          </li>
        </ul>
        <p>
          Die Maßnahmekosten beinhalten alle persönlichen Kosten für Lernmittel.
        </p>

        <SectionHeading n="4" title="Allgemeine Pflichten der Vertragspartner" />
        <p>
          Der Träger verpflichtet sich, die vorgenannte Maßnahme ordnungsgemäß
          durchzuführen und stellt insoweit qualifizierte Coaches, erforderliche
          Räumlichkeiten, Einrichtungen, IT-Infrastruktur sowie sonstige
          benötigte Materialien zur Verfügung. Der Träger verpflichtet sich
          darüber hinaus, die Maßnahme gemäß allen gesetzlichen Vorschriften,
          den Vorgaben der Bundesagentur für Arbeit / des Jobcenters und den
          internen Qualitätsstandards durchzuführen.
        </p>
        <p>
          Der TN verpflichtet sich, dem Bildungsträger jeden Wohnungswechsel,
          Namensänderungen sowie Änderungen der Kontaktdaten (Telefonnummer,
          E-Mail) unverzüglich anzuzeigen. Darüber hinaus verpflichtet sich der
          TN, die erbrachten Unterrichtseinheiten (UE) fristgerecht zu signieren
          bzw. per Unterschriftenliste zu bestätigen.
        </p>

        <SectionHeading n="5" title="Übernahme der Maßnahmekosten" />
        <p>
          Bei Förderung durch die Agentur für Arbeit oder das Jobcenter mittels
          eines Aktivierungs- und Vermittlungsgutscheins (AVGS) ist dieser
          rechtzeitig vor Maßnahmebeginn im Original oder in vereinbarter
          digitaler Form bei dem Träger einzureichen. Entsprechendes gilt für
          Bewilligungen anderer Leistungsträger.
        </p>

        <SectionHeading
          n="6"
          title="Informationen zur Maßnahme & Vorgaben des Kostenträgers"
        />
        <p>
          Der TN wurde in einem Vorgespräch über das Maßnahmenkonzept und die
          individuell geplanten Inhalte umfassend informiert. Sofern erango vor
          Beginn ein individuelles Angebot unterbreitet hat, gelten die darin
          festgelegten Inhalte als verbindlich und sind integraler Bestandteil
          dieses Vertrages.
        </p>
        <p>
          Der TN wurde auf die für AVGS gültigen Regeln und Pflichten (z. B.
          Mindestfrequenz von 2 Terminen pro Woche, rechtzeitige Krankmeldung,
          unverzügliche Meldung bei Arbeitsaufnahme) hingewiesen. Der Coach
          prüft die Eignung des TN für die Maßnahme und bestätigt diese.
          Unregelmäßigkeiten im Coaching oder Beschwerden können vertraulich per
          E-Mail an avgs@erango.de gemeldet werden.
        </p>

        <SectionHeading n="7" title="Rücktritt und Kündigung" />
        <Clause label="(1) Kostenfreier Rücktritt vor Beginn:">
          Der TN kann jederzeit kostenfrei und ohne Angabe von Gründen vom
          Vertrag zurücktreten.
        </Clause>
        <Clause label="(2) Kündigung bei Arbeitsaufnahme oder Wegfall der Förderung:">
          Der TN kann den Vertrag jederzeit fristlos und kostenfrei kündigen,
          wenn:
        </Clause>
        <ul>
          <li>
            eine Förderung durch den Kostenträger (Agentur für Arbeit /
            Jobcenter) nicht erfolgt, endet oder widerrufen wird,
          </li>
          <li>
            der TN eine sozialversicherungspflichtige Beschäftigung oder
            selbstständige Tätigkeit aufnimmt,
          </li>
          <li>
            eine dauerhafte Erkrankung die weitere Teilnahme unmöglich macht.
          </li>
        </ul>
        <Clause label="(3) Form der Kündigung:">
          Jede Kündigung oder Rücktrittserklärung muss in Textform an
          avgs@erango.de erfolgen.
        </Clause>
        <Clause label="(4) Kündigung aus wichtigem Grund:">
          Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt
          für beide Vertragsparteien unberührt.
        </Clause>
        <Clause label="(5) Vertragsende und Teilnahmebescheinigung:">
          Der Vertrag endet automatisch mit dem regulären Ablauf der Maßnahme,
          ohne dass es einer Kündigung bedarf. Nach Beendigung der Maßnahme –
          unabhängig davon, ob regulär oder vorzeitig – erhält der TN eine
          Teilnahmebescheinigung. Diese dokumentiert den Zeitraum, die
          vermittelten Inhalte, die erbrachten Leistungen und die Zielsetzung
          des Coachings.
        </Clause>

        <SectionHeading n="8" title="Hausordnung & Durchführungsbestimmungen" />
        <p>
          Die Hausordnung und das allgemeine Hygienekonzept gelten für alle
          Präsenz- und Online-Termine des Trägers an allen Standorten.
        </p>
        <Clause label="8.1 Teilnahme & Pünktlichkeit:">
          Vereinbarte Termine sind pünktlich und zuverlässig wahrzunehmen (egal
          ob vor Ort oder digital). Bitte erscheinen Sie vorbereitet.
          Verspätungen oder Absagen melden Sie bitte so früh wie möglich direkt
          bei Ihrem Coach oder in unserer Zentrale (Tel. 07731 909718-10,
          E-Mail: avgs@erango.de).
        </Clause>
        <Clause label="8.2 Krankheitsbedingte Ausfälle:">
          Bitte informieren Sie uns am ersten Krankheitstag möglichst
          frühzeitig. Für die Meldung beim Jobcenter/der Agentur für Arbeit
          gelten die dortigen gesetzlichen Vorgaben (z. B. Abrufbarkeit der
          elektronischen Arbeitsunfähigkeitsbescheinigung eAU). Absagen werden
          maßnahmekonform dokumentiert und können den Coaching-Umfang
          beeinflussen.
        </Clause>
        <Clause label="8.3 Fehlzeiten & Meldepflicht:">
          Fehlzeiten werden erfasst und dem Kostenträger gemeldet. Bei
          unentschuldigten oder auffälligen Fehlzeiten erfolgt ein
          Klärungsgespräch, um die Coaching-Ziele nicht zu gefährden. Bei
          anhaltenden Verstößen ist erango zur Meldung an den Kostenträger
          verpflichtet.
        </Clause>
        <Clause label="8.4 Mitwirkungspflichten nach Maßnahmeende:">
          Zur Erfüllung der gesetzlichen Eingliederungsstatistik nach § 45 SGB
          III erfragt erango 6 Wochen sowie 6 Monate nach Ende des Coachings den
          aktuellen Eingliederungsstatus (z. B. Arbeitsaufnahme,
          Selbstständigkeit, Weiterbildung). Der TN verpflichtet sich,
          entsprechende Status mitzuteilen.
        </Clause>
        <Clause label="8.5 Verhalten & Schutz des Hausrechts:">
          Respektvoller und wertschätzender Umgang ist Grundvoraussetzung. Grobe
          Pflichtverletzungen (z. B. vorsätzliche Sachbeschädigung,
          Alkohol-/Drogenkonsum, Diebstahl, Diskriminierung, Beleidigungen,
          Übergriffe oder anhaltende Verweigerung der Mitwirkung) können in
          Abstimmung mit dem Kostenträger zum Ausschluss vom Coaching oder zu
          einem Hausverbot führen.
        </Clause>
        <Clause label="8.6 Hygienemaßnahmen:">
          Räume werden regelmäßig gelüftet und bei Bedarf desinfiziert. Bei
          akuten, ansteckenden Infektionssymptomen ist eine Präsenzteilnahme
          nicht gestattet; das Coaching kann in diesem Fall kurzfristig auf
          digitale Durchführung umgestellt werden, um Fehlzeiten zu vermeiden.
        </Clause>
        <Clause label="8.7 Rauchverbot & Haftung:">
          In allen Innenräumen gilt ein striktes Rauchverbot. Für persönliche
          Wertgegenstände der Teilnehmenden übernimmt die erango GmbH keine
          Haftung. Der TN haftet für Schäden, die er dem Träger oder Dritten
          vorsätzlich oder fahrlässig zufügt.
        </Clause>

        <SectionHeading
          n="9"
          title="Datenschutzhinweise (Art. 13 / 14 DSGVO i. V. m. SGB X)"
        />
        <Clause label="9.1 Verantwortlicher:">
          erango GmbH, Scheffelstraße 28, 78224 Singen, E-Mail: avgs@erango.de.
        </Clause>
        <Clause label="9.2 Rechtsgrundlagen & Zwecke:">
          Die Verarbeitung personenbezogener Daten und Sozialdaten erfolgt zur
          Durchführung, Dokumentation und Abrechnung der AVGS-Maßnahme auf
          Grundlage von Art. 6 Abs. 1 lit. b DSGVO (Vertrag), Art. 6 Abs. 1 lit.
          c DSGVO i. V. m. § 45 SGB III und §§ 67 ff. SGB X (Rechtspflichten)
          sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an interner
          Organisation und Qualitätssicherung).
        </Clause>
        <Clause label="9.3 Verarbeitete Datenkategorien:">
          Stammdaten, Kontaktdaten, Maßnahme- und Förderdaten, Bewerbungs- und
          Qualifikationsdaten, Diagnostik- und Testdaten (z. B.
          Potenzialanalysen/Gepedu), Dokumentationsdaten (Termine, Inhalte,
          Teilnahmeberichte), IT-Protokolldaten sowie ggf. Erstattungsdaten für
          Fahrtkosten.
        </Clause>
        <Clause label="9.4 Datenempfänger:">
          Interne Fachbereiche (Coaching, Verwaltung, Abrechnung),
          Bundesagentur für Arbeit / Jobcenter, zugelassene
          AZAV-Zertifizierungsstellen (Audits) sowie streng gemäß Art. 28 DSGVO
          gebundene Auftragsverarbeiter (Hosting, IT-Support,
          Videokonferenzdienste). Eine Übermittlung an potenzielle Arbeitgeber
          erfolgt ausschließlich nach gesonderter, ausdrücklicher Einwilligung
          des TN.
        </Clause>
        <Clause label="9.5 Speicherdauer & Drittlandübermittlung:">
          Eine Drittlandübermittlung findet nicht statt. Daten werden nach
          Zweckfortfall bzw. nach Ablauf der gesetzlichen Aufbewahrungs- und
          Prüffristen der BA/Jobcenter sowie handels- und steuerrechtlichen
          Fristen (6 bis 10 Jahre) gelöscht.
        </Clause>
        <Clause label="9.6 Betroffenenrechte:">
          Sie haben das Recht auf Auskunft, Berichtigung, Löschung,
          Einschränkung der Verarbeitung, Datenübertragbarkeit sowie
          Widerspruch. Einwilligungen können jederzeit mit Wirkung für die
          Zukunft widerrufen werden. Beschwerderecht steht Ihnen beim
          Landesbeauftragten für den Datenschutz Baden-Württemberg zu.
        </Clause>

        <SectionHeading n="10" title="Schlussbestimmungen (Salvatorische Klausel)" />
        <p>
          Sollten einzelne Bestimmungen dieses Vertrages unwirksam oder
          undurchführbar sein oder nach Vertragsschluss unwirksam oder
          undurchführbar werden, so wird dadurch die Wirksamkeit des Vertrages im
          Übrigen nicht berührt. Anstelle der unwirksamen oder undurchführbaren
          Bestimmung gelten die gesetzlichen Vorschriften.
        </p>

        <SectionHeading
          n="11"
          title="Verbindliche Anmeldung und Einverständniserklärung"
        />
        <p>
          Mit meiner Unterschrift melde ich mich verbindlich zur oben genannten
          AVGS-Einzelmaßnahme an und bestätige ausdrücklich, dass ich:
        </p>
        <ol className="doc-list-decimal">
          <li>
            den Inhalt dieses Teilnehmervertrags (inkl. Rücktritts-, Kündigungs-
            und Mitwirkungspflichten) gelesen, verstanden und als verbindlich
            akzeptiert habe,
          </li>
          <li>
            die Hausordnung und das Hygienekonzept (Abschnitt 8) als
            verbindlichen Bestandteil der Zusammenarbeit anerkenne,
          </li>
          <li>
            die Datenschutzhinweise nach DSGVO / SGB X (Abschnitt 9) zur Kenntnis
            genommen habe und über meine Rechte informiert wurde,
          </li>
          <li>
            eine Ausfertigung dieses Vertragsdokuments erhalten habe (bzw. über
            den persönlichen Cloud-Kundenordner abrufen kann).
          </li>
        </ol>
      </div>

      <SignatureLine
        role="Teilnehmer/in (TN)"
        ort={data.formData.ort}
        signature={data.signatures.participant}
      />
      <SignatureLine
        role="erango GmbH (Mitarbeiter/in)"
        ort={data.formData.ort}
        signature={data.signatures.coach}
      />
    </DocumentFrame>
  );
}

function SectionHeading({ n, title }: { n: string; title: string }) {
  return (
    <div className="doc-numbered">
      <span className="doc-numbered-badge">{n}</span>
      <h2>{title}</h2>
    </div>
  );
}

/** Absatz mit fettem Vorspann (z. B. „8.1 Teilnahme & Pünktlichkeit: …"). */
function Clause({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p>
      <strong>{label}</strong> {children}
    </p>
  );
}

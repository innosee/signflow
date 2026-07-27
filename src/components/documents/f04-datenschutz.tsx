import {
  DocumentFrame,
  SignatureLine,
} from "@/components/documents/document-frame";
import type { DocumentSheetData } from "@/components/documents/types";
import { participantDisplayName } from "@/components/documents/util";

/**
 * F 04 — Datenschutzerklärung (Art. 13/14 DSGVO). Reiner Rechtstext + Name +
 * zwei Unterschriften (Teilnehmer:in + erango Mitarbeiter:in; erango zuerst).
 */
export function F04Datenschutz({ data }: { data: DocumentSheetData }) {
  const ort = data.formData.ort ?? "";
  return (
    <DocumentFrame
      formNumber="F 04"
      revision="25.06.2025"
      title="Datenschutzerklärung"
      subtitle="Datenschutzhinweise nach Art. 13/14 DSGVO für Teilnehmer:innen von AVGS-Einzelcoachings (§ 45 SGB III, Nr. 1, 4, 5)"
      logoUrl={data.branding.logoUrl}
    >
      <F04Body />
      <div className="doc-field" style={{ marginTop: "5mm" }}>
        <span className="doc-field-label">Name, Vorname (Teilnehmende:r):</span>
        <span className="doc-field-value">
          {participantDisplayName(data.participant)}
        </span>
      </div>
      <SignatureLine
        role="Teilnehmende:r (m/w/d)"
        ort={ort}
        signature={data.signatures.participant}
      />
      <SignatureLine
        role="erango Mitarbeitende:r (m/w/d)"
        ort={ort}
        signature={data.signatures.coach}
      />
    </DocumentFrame>
  );
}

/**
 * Rechtstext der Datenschutzerklärung (ohne Rahmen/Name/Unterschrift) — wird
 * auch vom kombinierten TNV+DS-Dokument genutzt.
 */
export function F04Body() {
  return (
    <>
      <div className="doc-small">
        <p>
          Im Folgenden informieren wir Sie über unsere Verarbeitungen Ihrer
          personenbezogenen Daten und die Ihnen aus der Datenschutz-Grundverordnung
          (DSGVO) uns gegenüber zustehenden Rechte.
        </p>

        <h2>1. Verantwortlicher für die Datenverarbeitung</h2>
        <p>
          Verantwortlicher im Sinne der DSGVO ist die erango GmbH,
          Ekkehardstraße 12b, 78224 Singen, Tel.: +49 (0) 7731 909718-10,
          E-Mail: avgs@erango.de.
        </p>

        <h2>2. Datenverarbeitungsinformation</h2>
        <p>
          Wir erheben und verarbeiten Ihre personenbezogenen Daten nur im Rahmen
          gesetzlicher Erlaubnistatbestände oder auf Grundlage Ihrer
          ausdrücklichen Einwilligung und unter Beachtung der DSGVO, des
          Bundesdatenschutzgesetzes (BDSG) sowie aller weiteren maßgeblichen
          Gesetze zum Datenschutz.
        </p>

        <h2>3. Kategorien personenbezogener Daten</h2>
        <p>
          <strong>Betroffenenkategorie:</strong> Teilnehmende (m/w/d) von
          AVGS-Maßnahmen der erango GmbH.
        </p>
        <p>
          <strong>Datenkategorien:</strong> Stammdaten, Kontakt- und Adressdaten;
          Maßnahme-/Vertrags- und Förderdaten; Bewerbungs-/Qualifikationsdaten;
          Dokumentationsdaten (Termine, Inhalte in Stichpunkten, Teilnahmebericht,
          Teilnahmebescheinigung); Kommunikations-/IT-Protokolldaten (z. B.
          Videokonferenz-Metadaten); optional Bank-/Erstattungsdaten (z. B. für
          Fahrtkostenerstattungen).
        </p>
        <p>
          <strong>Zweck der Verarbeitung:</strong> Vorbereitung, Durchführung,
          Dokumentation und Abrechnung der AVGS-Maßnahme, Kommunikation mit Ihnen,
          Coaches sowie BA/Jobcenter, Erstellung von Bescheinigungen/
          Abschlussunterlagen, optional Fahrtkostenabwicklung, digitale
          Durchführung (Video/Telefon/Dateiaustausch), Vorstellung bei
          potenziellen Arbeitgebern ausschließlich mit gesonderter Einwilligung,
          Qualitätssicherung/Audits (AZAV/Trägerprüfung/AMDL-Prüfungen).
        </p>
        <p>
          <strong>Rechtsgrundlage:</strong> Vertrag/Anbahnung (Art. 6 Abs. 1 b
          DSGVO); Rechtspflichten (Art. 6 Abs. 1 c DSGVO i. V. m. § 45 SGB III,
          § 67 ff. SGB X); berechtigtes Interesse (Art. 6 Abs. 1 f DSGVO);
          Einwilligungen (Art. 6 Abs. 1 a DSGVO; für besondere Kategorien
          zusätzlich Art. 9 Abs. 2 a DSGVO).
        </p>
        <p>
          <strong>Herkunft der Daten (Art. 14 DSGVO):</strong> Sie selbst;
          BA/Jobcenter (Vermittlung/AVGS-Daten); unsere Coaches.
        </p>
        <p>
          <strong>Empfängerkategorien:</strong> Interne Fachbereiche; BA/Jobcenter
          im Rahmen der Maßnahme/Abrechnung; Auftragsverarbeiter (IT-/Hosting-/
          Videokonferenz-/Support-Dienstleister) mit AV-Verträgen (Art. 28 DSGVO);
          Prüf-/Zertifizierungsstellen (AZAV); potenzielle Arbeitgeber
          ausschließlich mit Ihrer Einwilligung.
        </p>
        <p>
          <strong>Drittlandübermittlungen:</strong> Eine Übermittlung außerhalb
          der EU/EWR findet nicht statt.
        </p>

        <h2>Speicherdauer</h2>
        <p>
          Wir verarbeiten Ihre Daten für die Dauer der Maßnahme und löschen bzw.
          anonymisieren, sobald der Zweck entfällt. Förder-/Prüf-/Nachweisdaten
          speichern wir bis zum Ablauf der zuwendungs-/förder- und
          prüfungsrechtlichen Fristen; Handels-/Steuerunterlagen nach HGB/AO bis
          zu 6/10 Jahren; Anspruchs-/Verteidigungsdaten bis zum Ablauf
          gesetzlicher Verjährungsfristen. Marketingdaten nur bei gesonderter
          Einwilligung und bis zum Widerruf.
        </p>

        <h2>Pflicht zur Bereitstellung</h2>
        <p>
          Ohne die als erforderlich gekennzeichneten Daten ist die Teilnahme an
          der Maßnahme/Abrechnung regelmäßig nicht möglich.
        </p>

        <h2>Automatisierte Entscheidungen / Profiling</h2>
        <p>
          Wir treffen keine ausschließlich automatisierten Entscheidungen i. S. v.
          Art. 22 DSGVO.
        </p>

        <h2>Ihre Rechte (Art. 15–22 DSGVO)</h2>
        <p>
          Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit,
          Widerspruch gegen Verarbeitungen auf Basis Art. 6 Abs. 1 f DSGVO,
          Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft.
        </p>

        <h2>Beschwerderecht</h2>
        <p>
          Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren,
          insbesondere in Ihrem Bundesland oder am Sitz der Verantwortlichen
          (Baden-Württemberg).
        </p>

        <h2>Widerruf von Einwilligungen</h2>
        <p>
          Sie können erteilte Einwilligungen jederzeit mit Wirkung für die Zukunft
          per E-Mail an avgs@erango.de oder postalisch an erango GmbH,
          Ekkehardstraße 12b, 78224 Singen widerrufen. Die bis zum Widerruf
          erfolgte Verarbeitung bleibt rechtmäßig. Der Widerruf betrifft nur den
          jeweils genannten Zweck und lässt andere Rechtsgrundlagen unberührt.
        </p>
      </div>

      <p className="doc-small" style={{ marginTop: "4mm" }}>
        <strong>Hinweis auf Haus- und Hygieneordnung</strong> (kein Bestandteil
        dieser Datenschutzhinweise): Für die Teilnahme gelten unsere Haus- und
        Hygieneordnung in der jeweils aktuellen Fassung.
      </p>
    </>
  );
}

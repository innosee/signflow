import {
  DocField,
  DocumentFrame,
  formatDate,
  SignatureLine,
} from "@/components/documents/document-frame";
import type { DocumentSheetData } from "@/components/documents/types";
import type { ReactNode } from "react";

/**
 * F 08 — Teilnehmervertrag / Anmeldung AVGS. Persönliche Stammdaten +
 * Maßnahmedaten + Vertragsklauseln + zwei Unterschriften (Teilnehmer:in +
 * erango Mitarbeiter:in; erango zuerst).
 */
export function F08Teilnehmervertrag({ data }: { data: DocumentSheetData }) {
  return (
    <DocumentFrame
      formNumber="F 08"
      revision="25.06.2025"
      title="Teilnehmervertrag / Anmeldung I AVGS"
      logoUrl={data.branding.logoUrl}
    >
      <F08Body data={data} />
      <SignatureLine
        role="Teilnehmer:in"
        ort={data.formData.ort}
        signature={data.signatures.participant}
      />
      <SignatureLine
        role="erango Mitarbeiter:in"
        ort={data.formData.ort}
        signature={data.signatures.coach}
      />
    </DocumentFrame>
  );
}

/**
 * Rumpf des Teilnehmervertrags (ohne Rahmen/Unterschrift) — wird auch vom
 * kombinierten TNV+DS-Dokument genutzt.
 */
export function F08Body({ data }: { data: DocumentSheetData }) {
  const p = data.participant;
  const f = data.formData;
  return (
    <>
      <p className="doc-small">
        <strong>Vertragspartner</strong> sind erango GmbH, Ekkehardstraße 12b,
        78224 Singen, vertreten durch die jeweilige Niederlassung, und
        nachfolgende:r <strong>Teilnehmer:in</strong> (nachfolgend TN):
      </p>

      <DocField label="Name (TN):" value={p.nachname} />
      <DocField label="Vorname (TN):" value={p.vorname} />
      <DocField label="Straße / Hausnummer:" value={p.strasse} />
      <DocField
        label="PLZ, Ort:"
        value={[p.plz, p.ort].filter(Boolean).join(" ")}
      />
      <DocField label="Geburtsort:" value={p.geburtsort} />
      <DocField label="Festnetznummer:" value={p.festnetz} />
      <DocField label="Mobilfunknummer:" value={p.phone} />
      <DocField label="E-Mail-Adresse:" value={p.email} />

      <h2 style={{ marginTop: "5mm" }}>Angaben zur Maßnahme</h2>
      <DocField label="Maßnahme:" value={f.massnahme} />
      <DocField label="Ort:" value={f.ort} />
      <DocField label="Anzahl UE:" value={f.anzahlUe} />
      <DocField label="UE pro Woche:" value={f.ueProWoche} />
      <DocField label="Beginn:" value={formatDate(f.beginn)} />
      <DocField label="vorauss. Ende:" value={formatDate(f.voraussEnde)} />

      <div className="doc-small">
        <h2 style={{ marginTop: "5mm" }}>Präambel</h2>
        <p>
          Die Maßnahmen Karrierecoaching (EKC), Systemisches Coaching (ESC),
          Gründercoaching (EGC), systemisches Coaching für Migranten und
          Flüchtlinge (EMFC) und systemisches Stabilisierungscoaching für
          Arbeitnehmer (ESCA) der erango GmbH sind durch die fachkundige Stelle
          DEKRA Certification GmbH nach dem Recht der Arbeitsförderung (AZAV)
          zugelassen. Die Maßnahmekosten sind mit der Zulassung festgeschrieben.
          Sie beinhalten alle persönlichen Kosten für Lernmittel.
        </p>

        <Numbered n="1" title="Pflichten">
          Die erango GmbH verpflichtet sich, die vorgenannte Maßnahme
          durchzuführen und stellt Trainer/Coachs, erforderliche Einrichtungen
          und Materialien zur Verfügung. Der TN verpflichtet sich, jeden
          Wohnungswechsel und andere relevante Datenänderungen unverzüglich
          anzuzeigen sowie die erbrachten UE zu signieren.
        </Numbered>

        <Numbered n="2" title="Übernahme der Maßnahmekosten">
          Bei Förderung durch die Agentur für Arbeit / das Jobcenter mittels
          Bildungsgutschein oder AVGS ist dieser rechtzeitig vor Maßnahmebeginn
          bei der erango GmbH einzureichen. Entsprechendes gilt für andere
          Förderzusagen.
        </Numbered>

        <Numbered n="3" title="Informationen zur Maßnahme und Regeln des Bedarfsträgers">
          Der TN ist in einem Vorgespräch über das Maßnahmenkonzept und die
          geplanten Inhalte informiert worden. Der TN wurde auf die für AVGS
          gültigen Regeln und Pflichten (z. B. 2 Termine/Woche, Verhalten bei
          Krankheit und Arbeitsaufnahme) hingewiesen. Der Coach prüft und
          bestätigt die Eignung des TN für die Maßnahme.
        </Numbered>

        <Numbered n="4" title="Rücktritt / Kündigung">
          Der TN hat ein kostenloses Rücktrittsrecht, falls keine Förderung nach
          SGB II/III erfolgt oder bei Aufnahme einer sozialversicherungs-
          pflichtigen Beschäftigung bzw. dauerhafter Krankheit. Zusätzlich
          besteht ein allgemeines kostenloses Rücktrittsrecht innerhalb von 14
          Tagen nach Vertragsabschluss, längstens bis zum Beginn der Maßnahme.
          Nach Beginn kann der TN mit einer Frist von 6 Wochen zum Ablauf der
          ersten drei Monate, danach zum Ablauf weiterer drei Monate kündigen.
          Beide Parteien können aus wichtigem Grund kündigen. Der Vertrag endet
          automatisch nach Ablauf der Maßnahme und Signatur sämtlicher Dokumente.
        </Numbered>

        <Numbered n="5" title="Haftung">
          Der TN haftet für Schäden, die er/sie der erango GmbH oder Dritten
          zufügt.
        </Numbered>

        <Numbered n="6" title="Es gilt die Hausordnung">
          der erango GmbH, die in den Niederlassungen aushängt.
        </Numbered>

        <Numbered n="7" title="Hinweis auf Datenschutzerklärung">
          Dieser Vertrag wird durch die beigefügte Datenschutzerklärung ergänzt,
          die Bestandteil dieses Vertrages ist. Mit Ihrer Unterschrift bestätigen
          Sie, dass Sie die Datenschutzerklärung zur Kenntnis genommen haben.
        </Numbered>

        <Numbered n="8" title="Salvatorische Klausel">
          Sollten einzelne Bestimmungen dieses Vertrages unwirksam oder
          undurchführbar sein, wird die Wirksamkeit des Vertrages im Übrigen nicht
          berührt. An die Stelle der unwirksamen Bestimmung tritt eine wirksame
          Regelung, die dem wirtschaftlichen Zweck möglichst nahekommt.
        </Numbered>

        <p style={{ marginTop: "3mm" }}>
          <strong>
            Ich melde mich für die Teilnahme an der o. g. Maßnahme verbindlich an.
          </strong>
        </p>
      </div>
    </>
  );
}

function Numbered({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="doc-numbered">
        <span className="doc-numbered-badge">{n}</span>
        <h2>{title}</h2>
      </div>
      <p>{children}</p>
    </>
  );
}

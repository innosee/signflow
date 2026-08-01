import { formatDateDE } from "@/lib/format-date";
import { isMassnahmeTyp } from "@/lib/massnahme-typ";
import { TNB_MASSNAHME_TITEL, tnbInhalteListe } from "@/lib/documents/tnb-katalog";
import type { DocumentSheetData } from "@/components/documents/types";

/**
 * Teilnahmebescheinigung (erango F 05-x) — HTML-as-Source-of-Truth: dieselbe
 * Komponente rendert die Coach-Vorschau und (Print/Puppeteer) das A4-PDF.
 *
 * Reines erango-Ausstellungsdokument: nur die erango-Org-Signatur
 * (`data.orgSignatureUrl`) + Geschäftsführung, KEINE Teilnehmer-Unterschrift.
 * Inhalte kommen aus der Coach-Auswahl (`form_data.selectedKeys/customLines`),
 * Zeitraum/UE/Ort aus dem Kurs (bei ausgestellten Bescheinigungen aus dem
 * `cert_*`-Snapshot). Fußzeile/Geschäftsführung sind für den Prototyp
 * erango-fest verdrahtet (wie die F08/F21-Briefkopf-Adresse).
 */
export function TnbTeilnahmebescheinigung({
  data,
}: {
  data: DocumentSheetData;
}) {
  const fd = data.formData;
  const typ = isMassnahmeTyp(data.course.massnahmeTyp)
    ? data.course.massnahmeTyp
    : null;

  const massnahmeTitel = typ
    ? TNB_MASSNAHME_TITEL[typ]
    : data.course.massnahmeLabel;

  const von = fd.cert_von || data.course.startDate || "";
  // Zeitraum-Ende = letzter tatsächlicher Termin; Bewilligungsende nur Fallback.
  const bis =
    fd.cert_bis || data.course.letzterTermin || data.course.endDate || "";
  const ue =
    fd.cert_ue ||
    (data.course.anzahlBewilligteUe != null
      ? String(data.course.anzahlBewilligteUe)
      : "");
  const ort = fd.cert_ort || data.course.durchfuehrungsort || "";
  // Ausgestellt → eingefrorenes Datum; Entwurf-Vorschau → heute (statt „den —").
  const ausstellungsdatum: string | Date = fd.cert_datum || new Date();

  const selectedKeys = parseJsonArray(fd.selectedKeys);
  const customLines = parseJsonArray(fd.customLines);
  const inhalte = typ
    ? tnbInhalteListe(typ, selectedKeys, customLines)
    : customLines.map((l) => l.trim()).filter(Boolean);

  return (
    <article className="tnb" aria-label="Teilnahmebescheinigung">
      <div className="tnb-body">
      <header className="tnb-head">
        <div className="tnb-logo">
          {data.branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.branding.logoUrl}
              alt="erango"
              className="tnb-logo-img"
            />
          ) : (
            <div className="tnb-logo-fallback">
              er—
              <br />
              an
              <br />
              go.
            </div>
          )}
        </div>
        <h1 className="tnb-title">Teilnahmebescheinigung</h1>
      </header>

      <p className="tnb-name">
        Frau / Herr {data.participant.name || "—"}
      </p>

      <p className="tnb-intro">
        hat vom {formatDateDE(von) || "—"} bis {formatDateDE(bis) || "—"}
        <br />
        am beruflichen Einzelcoaching
      </p>

      <p className="tnb-massnahme">{massnahmeTitel}</p>

      <p className="tnb-para">
        nach §16 Abs.1 SGB II i.V.m. §45 Abs. 1 Satz 1 Nr. 1 SGB III
      </p>

      <p className="tnb-para tnb-ue">
        mit insgesamt {ue || "—"} UE in {ort || "—"}
        <br />
        erfolgreich teilgenommen.
      </p>

      <h2 className="tnb-inhalte-title">Inhalte:</h2>
      {inhalte.length > 0 ? (
        <ul className="tnb-inhalte">
          {inhalte.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="tnb-inhalte-empty">— noch keine Inhalte ausgewählt —</p>
      )}

      <div className="tnb-sign">
        <p className="tnb-sign-ort">
          erango GmbH Singen,
          <br />
          den {formatDateDE(ausstellungsdatum)}
        </p>
        <div className="tnb-sign-img">
          {data.orgSignatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.orgSignatureUrl}
              alt="Unterschrift Geschäftsführung"
              className="tnb-sign-signature"
            />
          ) : null}
        </div>
        <p className="tnb-sign-name">
          Victoria Dressel
          <br />
          Geschäftsführerin
        </p>
      </div>
      </div>

      <footer className="tnb-foot">
        <p className="tnb-foot-services">
          erango Karrierecoaching (EKC) • erango Gründungscoaching (EGC) • erango
          Systemisches Coaching (ESC) • erango Stabilisierung während der Probezeit
          (ESCA)
        </p>
        <div className="tnb-foot-contact">
          <span>info@erango.de</span>
          <span>+49 (0) 7731 909 718 10</span>
          <span>Scheffelstraße 28, D-78224 Singen</span>
          <span>erango GmbH</span>
        </div>
        <div className="tnb-foot-legal">
          <span>Geschäftsführerin: Victoria Dressel</span>
          <span>IBAN: DE50 6905 1410 0007 0862 67 · BIC: SOLADES1REN</span>
          <span>Bezirkssparkasse Reichenau</span>
          <span>Singen, Freiburg im Breisgau · HRB 704979</span>
          <span>USt-ID: DE271240874</span>
        </div>
      </footer>

      <style>{tnbCss}</style>
    </article>
  );
}

function parseJsonArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const tnbCss = `
.tnb {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #18181b;
  background: white;
  max-width: 210mm;
  margin: 0 auto;
  padding: 16mm 18mm 0 18mm;
  text-align: center;
  /* Volle A4-Höhe als Flex-Spalte: Inhalt oben, Footer per margin-top:auto
     immer am Seitenboden. box-sizing → Padding zählt in die 297mm, sonst
     rutscht es auf Seite 2. Inhalte sind auf max. 7 begrenzt → passt sicher
     auf eine Seite. */
  box-sizing: border-box;
  min-height: 297mm;
  display: flex;
  flex-direction: column;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.tnb-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5mm;
  margin-bottom: 9mm;
}
.tnb-logo {
  display: flex;
  justify-content: center;
}
.tnb-logo-img {
  max-height: 24mm;
  max-width: 60mm;
  object-fit: contain;
  display: block;
}
.tnb-logo-fallback {
  border: 1.5pt solid #14545f;
  color: #14545f;
  font-weight: 800;
  font-size: 13pt;
  line-height: 1.05;
  padding: 2mm 3mm;
  text-align: left;
  display: inline-block;
}
.tnb-title {
  font-size: 21pt;
  font-weight: 800;
  letter-spacing: 2px;
  margin: 0;
}
.tnb-name {
  font-size: 18pt;
  font-weight: 700;
  margin: 0 0 10mm 0;
}
.tnb-intro {
  font-size: 12pt;
  line-height: 1.5;
  margin: 0 0 8mm 0;
}
.tnb-massnahme {
  font-size: 17pt;
  font-weight: 700;
  margin: 0 0 6mm 0;
}
.tnb-para {
  font-size: 11pt;
  line-height: 1.5;
  margin: 0 0 5mm 0;
}
.tnb-ue {
  font-size: 12pt;
  margin-bottom: 10mm;
}
.tnb-inhalte-title {
  font-size: 16pt;
  font-weight: 800;
  margin: 0 0 5mm 0;
}
.tnb-inhalte {
  display: inline-block;
  text-align: left;
  margin: 0 auto 12mm auto;
  padding: 0;
  list-style: none;
}
.tnb-inhalte li {
  position: relative;
  padding-left: 6mm;
  margin-bottom: 2mm;
  font-size: 11pt;
  line-height: 1.4;
}
.tnb-inhalte li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 1.6mm;
  width: 2mm;
  height: 2mm;
  background: #1f6feb;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.tnb-inhalte-empty {
  color: #94a3b8;
  font-style: italic;
  margin: 0 0 12mm 0;
}
.tnb-sign {
  margin-top: 6mm;
}
.tnb-sign-ort {
  font-size: 11pt;
  line-height: 1.5;
  margin: 0 0 2mm 0;
}
.tnb-sign-img {
  min-height: 16mm;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.tnb-sign-signature {
  max-height: 16mm;
  max-width: 60mm;
  object-fit: contain;
}
.tnb-sign-name {
  font-size: 11pt;
  line-height: 1.4;
  margin: 1mm 0 0 0;
}
.tnb-foot {
  /* an den Seitenboden; Mindestabstand zum Inhalt via padding-top. */
  margin-top: auto;
  padding-top: 12mm;
}
.tnb-foot-services {
  font-size: 7.5pt;
  color: #14545f;
  font-weight: 600;
  margin: 0 0 2.5mm 0;
  line-height: 1.4;
}
.tnb-foot-contact {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1.5mm 5mm;
  font-size: 8pt;
  color: #3f3f46;
  border-top: 0.3mm solid #d4d4d8;
  padding: 2.5mm 0;
  margin-bottom: 3mm;
}
.tnb-foot-legal {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5mm 4mm;
  background: #14545f;
  color: #e8f0f1;
  font-size: 6.5pt;
  line-height: 1.5;
  /* full-bleed bis an die Seitenkanten (negatives Margin hebt das 18mm-
     Seitenpadding von .tnb auf), bündig am unteren Rand. */
  margin: 0 -18mm;
  padding: 2.5mm 18mm;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
@media print {
  @page {
    size: A4;
    margin: 0;
  }
  html, body { margin: 0; padding: 0; background: white; }
  .tnb {
    max-width: none;
    margin: 0;
    min-height: 297mm;
  }
}
`;

import { formatDateDE } from "@/lib/format-date";
import { formatUeDE } from "@/lib/format-ue";
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
 * `cert_*`-Snapshot).
 *
 * Design: offizielle Urkunde — dezenter Doppel-Zierrahmen, getrackte Versalien
 * (kein Custom-Serif, weil der Vercel-Chromium ihn unzuverlässig rendert →
 * Screen/PDF liefen sonst auseinander), erango-Teal als Akzent. Bewusst kompakt
 * dimensioniert, damit selbst die volle Inhalte-Liste sicher auf EINE A4-Seite
 * passt (Footer per margin-top:auto am Boden). Bank-/Legal-Angaben gehören nicht
 * auf die Urkunde; Footer/GF sind für den Prototyp erango-fest verdrahtet.
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
  // UE auf der Urkunde = tatsächlich GELEISTETE UE (Summe der signierten
  // Termine), nicht die bewilligten: endet die Maßnahme vorzeitig, wären die
  // bewilligten UE (z.B. 80 statt 17) schlicht falsch bescheinigt. Bei
  // ausgestellten Bescheinigungen gewinnt der eingefrorene `cert_ue`-Snapshot.
  const ue =
    fd.cert_ue ||
    (data.course.geleisteteUe != null ? formatUeDE(data.course.geleisteteUe) : "");
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
      <div className="tnb-frame">
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
            <div className="tnb-rule" aria-hidden />
          </header>

          <p className="tnb-eyebrow">Hiermit wird bescheinigt, dass</p>
          <p className="tnb-name">{data.participant.name || "—"}</p>

          <p className="tnb-intro">
            vom <strong>{formatDateDE(von) || "—"}</strong> bis{" "}
            <strong>{formatDateDE(bis) || "—"}</strong> am beruflichen
            Einzelcoaching
          </p>

          <p className="tnb-massnahme">{massnahmeTitel}</p>

          <p className="tnb-legal">
            nach § 16 Abs. 1 SGB II i.V.m. § 45 Abs. 1 Satz 1 Nr. 1 SGB III
          </p>

          <p className="tnb-ue">
            mit insgesamt <strong>{ue || "—"}</strong> UE in{" "}
            <strong>{ort || "—"}</strong> erfolgreich teilgenommen hat.
          </p>

          <div className="tnb-inhalte-head" aria-hidden>
            <span className="tnb-inhalte-head-line" />
            <span className="tnb-inhalte-head-label">Inhalte</span>
            <span className="tnb-inhalte-head-line" />
          </div>
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
              erango GmbH Singen, den {formatDateDE(ausstellungsdatum)}
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
            <div className="tnb-sign-line" aria-hidden />
            <p className="tnb-sign-name">Victoria Dressel</p>
            <p className="tnb-sign-role">Geschäftsführerin, erango GmbH</p>
          </div>
        </div>

        <footer className="tnb-foot">
          <p className="tnb-foot-services">
            Karrierecoaching (EKC) &nbsp;·&nbsp; Gründungscoaching (EGC)
            &nbsp;·&nbsp; Systemisches Coaching (ESC) &nbsp;·&nbsp; Stabilisierung
            während der Probezeit (ESCA)
          </p>
          <p className="tnb-foot-contact">
            info@erango.de &nbsp;·&nbsp; +49 (0) 7731 909 718 10 &nbsp;·&nbsp;
            Scheffelstraße 28, D-78224 Singen
          </p>
        </footer>
      </div>

      <style>{tnbCss}</style>
    </article>
  );
}

function parseJsonArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

const TEAL = "#14545f";

/*
 * Kompakt dimensioniert: selbst bei voller Inhalte-Liste bleibt Puffer auf der
 * A4-Seite. Wenn hier Größen erhöht werden, unbedingt gegen die längste Liste
 * (max. Punkte + eigene Zeilen) auf einer Seite gegenprüfen.
 */
const tnbCss = `
.tnb {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #1c2b2e;
  background: white;
  width: 210mm;
  max-width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
  min-height: 297mm;
  padding: 8mm;
  display: flex;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.tnb-frame {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 2pt double ${TEAL};
  padding: 12mm 15mm 8mm 15mm;
  text-align: center;
}
.tnb-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3.5mm;
  margin-bottom: 7mm;
}
.tnb-logo { display: flex; justify-content: center; }
.tnb-logo-img {
  max-height: 16mm;
  max-width: 46mm;
  object-fit: contain;
  display: block;
}
.tnb-logo-fallback {
  border: 1.2pt solid ${TEAL};
  color: ${TEAL};
  font-weight: 800;
  font-size: 10pt;
  line-height: 1.05;
  padding: 1.5mm 2.5mm;
  text-align: left;
}
.tnb-title {
  font-size: 15pt;
  font-weight: 700;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: ${TEAL};
  margin: 0;
}
.tnb-rule {
  width: 20mm;
  height: 1pt;
  background: ${TEAL};
  margin-top: -1mm;
}
.tnb-eyebrow {
  font-size: 8.5pt;
  color: #5b6b6e;
  letter-spacing: 0.4px;
  margin: 0 0 2.5mm 0;
}
.tnb-name {
  font-size: 15pt;
  font-weight: 700;
  color: #122326;
  letter-spacing: 0.3px;
  margin: 0 0 6mm 0;
}
.tnb-intro {
  font-size: 9.5pt;
  line-height: 1.5;
  margin: 0 0 3.5mm 0;
}
.tnb-intro strong, .tnb-ue strong { font-weight: 700; color: #12232e; }
.tnb-massnahme {
  font-size: 12.5pt;
  font-weight: 700;
  color: ${TEAL};
  letter-spacing: 0.3px;
  margin: 0 0 2.5mm 0;
}
.tnb-legal {
  font-size: 8pt;
  color: #6b7b7e;
  margin: 0 0 3.5mm 0;
}
.tnb-ue {
  font-size: 9.5pt;
  line-height: 1.5;
  margin: 0 0 7mm 0;
}
.tnb-inhalte-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4mm;
  margin: 0 0 4mm 0;
}
.tnb-inhalte-head-line {
  height: 0.5pt;
  width: 18mm;
  background: #c7d2d4;
}
.tnb-inhalte-head-label {
  font-size: 8.5pt;
  font-weight: 700;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: ${TEAL};
}
.tnb-inhalte {
  display: inline-block;
  text-align: left;
  margin: 0 auto 7mm auto;
  padding: 0;
  list-style: none;
  max-width: 155mm;
}
.tnb-inhalte li {
  position: relative;
  padding-left: 6mm;
  margin-bottom: 1.8mm;
  font-size: 9pt;
  line-height: 1.4;
}
.tnb-inhalte li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 1.3mm;
  width: 1.9mm;
  height: 1.9mm;
  transform: rotate(45deg);
  background: ${TEAL};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.tnb-inhalte-empty {
  color: #9aa7a9;
  font-style: italic;
  margin: 0 0 7mm 0;
}
.tnb-sign {
  margin-top: 2mm;
}
.tnb-sign-ort {
  font-size: 9pt;
  color: #3f4f52;
  margin: 0 0 0.5mm 0;
}
.tnb-sign-img {
  min-height: 10mm;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.tnb-sign-signature {
  max-height: 10mm;
  max-width: 46mm;
  object-fit: contain;
}
.tnb-sign-line {
  width: 50mm;
  height: 0.6pt;
  background: #1c2b2e;
  margin: 1mm auto 1.2mm auto;
}
.tnb-sign-name {
  font-size: 9.5pt;
  font-weight: 700;
  color: #12232e;
  margin: 0;
}
.tnb-sign-role {
  font-size: 8pt;
  color: #6b7b7e;
  margin: 0.4mm 0 0 0;
}
.tnb-foot {
  margin-top: auto;
  padding-top: 7mm;
}
.tnb-foot-services {
  font-size: 6.8pt;
  font-weight: 600;
  color: ${TEAL};
  letter-spacing: 0.3px;
  margin: 0 0 1.5mm 0;
}
.tnb-foot-contact {
  font-size: 6.8pt;
  color: #6b7b7e;
  border-top: 0.4pt solid #d7dedf;
  padding-top: 2mm;
  margin: 0;
}
@media print {
  @page {
    size: A4;
    margin: 0;
  }
  html, body { margin: 0; padding: 0; background: white; }
  .tnb {
    width: 210mm;
    max-width: none;
    margin: 0;
  }
}
`;

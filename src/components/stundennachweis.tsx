/**
 * AfA-Stundennachweis als **einzige** React-Komponente für Screen + Print.
 *
 * @media screen  → Coach/TN sehen dieselbe Struktur im Browser
 * @media print   → Puppeteer rendert daraus das finale A4-PDF
 *
 * Siehe CLAUDE.md → HTML-as-Source-of-Truth. Kein separates PDF-Layout,
 * keine Design-Drift. Print-spezifische Regeln leben in einem lokalen
 * `<style>`-Block statt in globals.css, damit das Layout in sich
 * abgeschlossen bleibt.
 */

export type StundennachweisSheet = {
  course: {
    title: string;
    avgsNummer: string;
    durchfuehrungsort: string;
    startDate: string;
    endDate: string;
    anzahlBewilligteUe: number;
    flagUnter2Termine: boolean;
    flagVorzeitigesEnde: boolean;
    begruendungText: string | null;
  };
  bedarfstraeger: {
    name: string;
    type: "JC" | "AA";
  };
  coach: {
    name: string;
  };
  participant: {
    name: string;
    kundenNr: string;
  };
  sessions: Array<{
    id: string;
    sessionDate: string;
    topic: string;
    anzahlUe: string;
    modus: "praesenz" | "online";
    isErstgespraech: boolean;
    geeignet: boolean | null;
    coachSignatureUrl: string | null;
    coachSignedAt: string | null;
    participantSignatureUrl: string | null;
    participantSignedAt: string | null;
  }>;
};

const BEDARFSTRAEGER_LABEL = { JC: "Jobcenter", AA: "Arbeitsagentur" } as const;

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  // Deutsches Kurzformat, Sekunden weglassen — Beweiskraft kommt aus dem
  // Zeitstempel in der DB, nicht aus der Darstellungsgenauigkeit.
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Stundennachweis(props: StundennachweisSheet) {
  const { course, bedarfstraeger, coach, participant, sessions } = props;

  const geleisteteUe = sessions
    .filter((s) => !s.isErstgespraech)
    .reduce((sum, s) => sum + Number.parseFloat(s.anzahlUe), 0);

  return (
    <>
      <style>{printCss}</style>
      <article className="sheet">
        <header className="sheet-header">
          <div className="sheet-title">
            <h1>Stundennachweis</h1>
            <p className="sheet-subtitle">
              AVGS-Maßnahme · Nachweis gemäß §45 SGB III
            </p>
          </div>
          <dl className="sheet-meta">
            <MetaRow label="AVGS-Nr." value={course.avgsNummer} />
            <MetaRow
              label="Bedarfsträger"
              value={`${bedarfstraeger.name} (${BEDARFSTRAEGER_LABEL[bedarfstraeger.type]})`}
            />
          </dl>
        </header>

        <section className="sheet-parties">
          <div>
            <h2>Maßnahme</h2>
            <dl>
              <MetaRow label="Titel" value={course.title} />
              <MetaRow label="Durchführungsort" value={course.durchfuehrungsort} />
              <MetaRow
                label="Zeitraum"
                value={`${formatDate(course.startDate)} – ${formatDate(course.endDate)}`}
              />
              <MetaRow
                label="Bewilligte UE"
                value={course.anzahlBewilligteUe.toString()}
              />
            </dl>
          </div>
          <div>
            <h2>Teilnehmer:in</h2>
            <dl>
              <MetaRow label="Name" value={participant.name} />
              <MetaRow label="Kunden-Nr. (AfA)" value={participant.kundenNr} />
            </dl>
            <h2 className="sheet-coach-heading">Coach</h2>
            <dl>
              <MetaRow label="Name" value={coach.name} />
            </dl>
          </div>
        </section>

        <section className="sheet-sessions">
          <h2>Termine</h2>
          {sessions.length === 0 ? (
            <p className="sheet-empty">Bisher keine Termine erfasst.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: "18%" }}>Datum</th>
                  <th style={{ width: "7%" }}>UE</th>
                  <th style={{ width: "10%" }}>Modus</th>
                  <th>Themen / Inhalte</th>
                  <th style={{ width: "18%" }}>Unterschrift Coach</th>
                  <th style={{ width: "18%" }}>Unterschrift Teilnehmer:in</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDate(s.sessionDate)}</td>
                    <td className="num">
                      {s.isErstgespraech ? "—" : formatUe(s.anzahlUe)}
                    </td>
                    <td>{s.modus === "online" ? "Online" : "Präsenz"}</td>
                    <td>
                      {s.isErstgespraech && (
                        <>
                          <strong>Erstgespräch</strong>
                          {" · "}
                          geeignet: {s.geeignet ? "JA" : "NEIN"}
                          <br />
                        </>
                      )}
                      {s.topic}
                    </td>
                    <td>
                      <SignatureCell
                        url={s.coachSignatureUrl}
                        signedAt={s.coachSignedAt}
                      />
                    </td>
                    <td>
                      <SignatureCell
                        url={s.participantSignatureUrl}
                        signedAt={s.participantSignedAt}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="num">
                    Gesamt: {formatUe(geleisteteUe.toString())} UE
                  </td>
                  <td colSpan={4} className="num">
                    von {course.anzahlBewilligteUe} bewilligten UE
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        {(course.flagUnter2Termine ||
          course.flagVorzeitigesEnde ||
          course.begruendungText) && (
          <section className="sheet-notes">
            <h2>Ergänzende Angaben</h2>
            <ul>
              <li>
                <Checkbox checked={course.flagUnter2Termine} />
                Weniger als 2 Termine pro Woche
              </li>
              <li>
                <Checkbox checked={course.flagVorzeitigesEnde} />
                Maßnahme vorzeitig beendet
              </li>
            </ul>
            {course.begruendungText && (
              <div className="sheet-begruendung">
                <strong>Begründung:</strong>
                <p>{course.begruendungText}</p>
              </div>
            )}
          </section>
        )}

        <footer className="sheet-footer">
          Erzeugt via Signflow. Finale Versiegelung via fortgeschrittener
          elektronischer Signatur (FES) durch den Coach nach Freigabe der
          Teilnehmer:in.
        </footer>
      </article>
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SignatureCell({
  url,
  signedAt,
}: {
  url: string | null;
  signedAt: string | null;
}) {
  if (!url) return <span className="sig-pending">ausstehend</span>;
  return (
    <div className="sig-box">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Unterschrift" />
      <span className="sig-timestamp">{formatDateTime(signedAt)}</span>
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return <span className="checkbox">{checked ? "☒" : "☐"}</span>;
}

function formatUe(value: string): string {
  // 2.0 → "2", 2.5 → "2,5" — deutsche Dezimalformatierung im Nachweis.
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return value;
  return (Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)).replace(".", ",");
}

// Print-CSS bewusst als Template-String im Layout, damit die A4-Druck-Regeln
// nicht durch globale CSS-Änderungen drift-anfällig werden. Farben im Print
// sind schwarz/weiß; die Screen-Darstellung fügt ein bisschen Grau für
// Lesbarkeit hinzu. Breite des Bogens ist 180mm (A4 210mm − 15mm Margin
// beidseits) — Puppeteer nutzt später `@page { margin: 15mm }` direkt aus.
const printCss = `
  .sheet {
    font-family: "Helvetica Neue", Arial, sans-serif;
    color: #111;
    max-width: 180mm;
    margin: 0 auto;
    padding: 12mm 10mm;
    background: #fff;
    font-size: 10pt;
    line-height: 1.35;
  }
  .sheet h1 { font-size: 18pt; margin: 0 0 2mm 0; }
  .sheet h2 {
    font-size: 11pt;
    margin: 6mm 0 2mm 0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #444;
  }
  .sheet-subtitle { margin: 0; color: #555; font-size: 10pt; }
  .sheet-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10mm;
    border-bottom: 1pt solid #111;
    padding-bottom: 4mm;
    margin-bottom: 6mm;
  }
  .sheet-meta { text-align: right; margin: 0; }
  .sheet-parties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8mm;
  }
  .sheet-coach-heading { margin-top: 4mm; }
  .sheet dl { margin: 0; }
  .sheet .meta-row {
    display: grid;
    grid-template-columns: 40mm 1fr;
    gap: 2mm;
    margin: 0 0 1mm 0;
  }
  .sheet dt { color: #555; font-size: 9pt; }
  .sheet dd { margin: 0; }
  .sheet-empty { color: #666; font-style: italic; }
  .sheet table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-top: 2mm;
  }
  .sheet th, .sheet td {
    border: 0.5pt solid #111;
    padding: 2mm;
    vertical-align: top;
    text-align: left;
    font-size: 9pt;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .sheet th { background: #f3f3f3; font-weight: 600; }
  .sheet td.num { text-align: right; }
  .sheet tfoot td { font-weight: 600; background: #fafafa; }
  .sig-box { display: block; }
  .sig-box img {
    display: block;
    max-height: 12mm;
    max-width: 100%;
    object-fit: contain;
  }
  .sig-timestamp {
    display: block;
    margin-top: 0.5mm;
    font-size: 7.5pt;
    color: #555;
  }
  .sig-pending { color: #999; font-style: italic; font-size: 9pt; }
  .checkbox { font-size: 12pt; margin-right: 2mm; }
  .sheet-notes ul { list-style: none; margin: 2mm 0; padding: 0; }
  .sheet-notes li { margin: 0 0 1.5mm 0; display: flex; align-items: center; }
  .sheet-begruendung { margin-top: 3mm; }
  .sheet-begruendung p {
    margin: 1mm 0 0 0;
    white-space: pre-wrap;
    border: 0.5pt solid #aaa;
    padding: 2mm;
    background: #fafafa;
  }
  .sheet-footer {
    margin-top: 10mm;
    padding-top: 3mm;
    border-top: 0.5pt solid #aaa;
    font-size: 8.5pt;
    color: #555;
  }
  .sheet table tr { page-break-inside: avoid; break-inside: avoid; }
  .sheet-parties, .sheet-notes { page-break-inside: avoid; break-inside: avoid; }
  @media print {
    @page { size: A4; margin: 10mm; }
    .sheet {
      padding: 0;
      max-width: none;
      margin: 0;
      box-shadow: none;
    }
    .sheet th, .sheet td { font-size: 8.5pt; }
  }
  @media screen {
    .sheet {
      box-shadow: 0 2px 16px rgba(0,0,0,0.08);
      margin: 8mm auto;
    }
  }
`;

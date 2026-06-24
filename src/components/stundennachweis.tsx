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

import {
  EIGNUNG_KRITERIEN,
  EIGNUNG_RATINGS,
  type Eignungsanalyse,
} from "@/lib/eignung";

export type StundennachweisSheet = {
  course: {
    title: string;
    avgsNummer: string;
    durchfuehrungsort: string;
    avgsGueltigVon: string;
    avgsGueltigBis: string;
    startDate: string | null;
    endDate: string | null;
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
    eignungsanalyse: Eignungsanalyse | null;
    /** Kompetenzteams: dem Termin zugewiesener Coach (Anzeige pro Zeile). */
    coachName: string;
    coachSignatureUrl: string | null;
    coachSignedAt: string | null;
    participantSignatureUrl: string | null;
    participantSignedAt: string | null;
  }>;
  /**
   * Chronologischer Audit-Trail aller signaturrelevanten Ereignisse für
   * dieses (Kurs × Teilnehmer)-Sheet — Coach-Signatur pro Session, TN-
   * Signatur pro Session, TN-Final-Approval. Wird unter dem Dokument als
   * eigener „Audit-Trail"-Block gerendert, damit IP + Zeitstempel auf
   * dem PDF sichtbar sind (CLAUDE.md Schritt 8). Reihenfolge: aufsteigend
   * nach `at`. Leer = noch nichts unterschrieben (z.B. bei TN-Preview vor
   * dem allerersten Sign).
   */
  audit: Array<{
    /** Eindeutig pro Zeile — Composite aus session+signer reicht. */
    key: string;
    kind: "coach-sign" | "participant-sign" | "participant-approval";
    /** ISO-Zeitstempel des Ereignisses. */
    at: string;
    /** Anzeigename (Coach: Coach-Name, TN: TN-Name, Approval: TN-Name). */
    signerName: string;
    /** Datum der betroffenen Session — null beim TN-Approval (kursweit). */
    sessionDate: string | null;
    /** IP-Adresse zum Zeitpunkt des Ereignisses. */
    ip: string;
  }>;
};

const BEDARFSTRAEGER_LABEL = { JC: "Jobcenter", AA: "Arbeitsagentur" } as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
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
  const { course, bedarfstraeger, coach, participant, sessions, audit } = props;

  // Kompetenzteams: sind mehrere Coaches im Spiel, wird der Coach PRO Termin
  // ausgewiesen (statt eines globalen Coaches). Bei genau einem Coach bleibt
  // das Sheet byte-identisch zur bisherigen Single-Coach-Darstellung.
  const coachNames = Array.from(
    new Set(sessions.map((s) => s.coachName).filter(Boolean)),
  );
  const multiCoach = coachNames.length > 1;
  const headerCoach =
    coachNames.length === 1
      ? coachNames[0]
      : coachNames.length === 0
        ? coach.name
        : "Mehrere Coaches (siehe Termine)";

  const geleisteteUe = sessions
    .filter((s) => !s.isErstgespraech)
    .reduce((sum, s) => sum + Number.parseFloat(s.anzahlUe), 0);

  return (
    <>
      <style>{printCss}</style>
      {/* lang="de" aktiviert die deutsche Silbentrennung (hyphens: auto) für
          die Fließtext-Spalten — bricht lange Wörter an Silbengrenzen statt
          hart mitten im Wort. */}
      <article className="sheet" lang="de">
        <header className="sheet-header">
          <div className="sheet-title">
            <h1>Stundennachweis</h1>
            <p className="sheet-subtitle">
              AVGS-Maßnahme · Nachweis gemäß §45 SGB III
            </p>
          </div>
          <dl className="sheet-meta">
            <MetaRow label="Maßnahmen-Nr." value={course.avgsNummer} />
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
              <MetaRow label="Typ" value={course.title} />
              <MetaRow label="Durchführungsort" value={course.durchfuehrungsort} />
              <MetaRow
                label="AVGS-Gültigkeit"
                value={`${formatDate(course.avgsGueltigVon)} – ${formatDate(course.avgsGueltigBis)}`}
              />
              <MetaRow
                label="Bewilligungszeitraum"
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
              <MetaRow label="Name" value={headerCoach} />
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
                  <th style={{ width: "15%" }}>Datum</th>
                  <th style={{ width: "6%" }}>UE</th>
                  <th style={{ width: "12%" }}>Modus</th>
                  <th>Themen / Inhalte</th>
                  <th style={{ width: "18%" }}>Unterschrift Coach</th>
                  <th style={{ width: "18%" }}>Unterschrift Teilnehmer:in</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="nowrap">{formatDate(s.sessionDate)}</td>
                    <td className="num">
                      {s.isErstgespraech ? "—" : formatUe(s.anzahlUe)}
                    </td>
                    <td className="nowrap">
                      {s.modus === "online" ? "Online" : "Präsenz"}
                    </td>
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
                      {multiCoach && (
                        <div className="sig-coach-name">{s.coachName}</div>
                      )}
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

        {sessions.some((s) => s.isErstgespraech && s.eignungsanalyse) && (
          <section className="sheet-eignung">
            {sessions
              .filter((s) => s.isErstgespraech && s.eignungsanalyse)
              .map((s) => (
                <div key={s.id}>
                  <h2>Eignungsanalyse (Erstgespräch {formatDate(s.sessionDate)})</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Kriterium</th>
                        {EIGNUNG_RATINGS.map((r) => (
                          <th key={r.value} className="num" style={{ width: "10%" }}>
                            {r.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {EIGNUNG_KRITERIEN.map((k) => (
                        <tr key={k.key}>
                          <td>{k.label}</td>
                          {EIGNUNG_RATINGS.map((r) => (
                            <td key={r.value} className="num">
                              <Checkbox
                                checked={s.eignungsanalyse?.[k.key] === r.value}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="sheet-eignung-result">
                    <strong>Ergebnis — TN ist geeignet:</strong>{" "}
                    <Checkbox checked={s.geeignet === true} /> Ja{"   "}
                    <Checkbox checked={s.geeignet === false} /> Nein
                  </p>
                </div>
              ))}
          </section>
        )}

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

        {audit.length > 0 && (
          <section className="sheet-audit">
            <h2>Audit-Trail</h2>
            <p className="sheet-audit-intro">
              Chronologische Aufzeichnung der Signatur- und Freigabe-Ereignisse
              gemäß §126a BGB / eIDAS Art. 26.
            </p>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "28%" }}>Zeitstempel</th>
                  <th style={{ width: "22%" }}>Ereignis</th>
                  <th>Beteiligte:r</th>
                  <th style={{ width: "20%" }}>Termin</th>
                  <th style={{ width: "18%" }}>IP-Adresse</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.key}>
                    <td>{formatDateTime(entry.at)}</td>
                    <td>{auditKindLabel(entry.kind)}</td>
                    <td>{entry.signerName}</td>
                    <td>
                      {entry.sessionDate
                        ? formatDate(entry.sessionDate)
                        : "—"}
                    </td>
                    <td className="mono">{entry.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

function auditKindLabel(kind: StundennachweisSheet["audit"][number]["kind"]): string {
  switch (kind) {
    case "coach-sign":
      return "Coach-Signatur";
    case "participant-sign":
      return "TN-Signatur";
    case "participant-approval":
      return "TN-Freigabe";
  }
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
    /* Chrome druckt Hintergrundfarben standardmäßig nicht, was den Tabellen-
       Header (#f3f3f3) und Audit-Stripes unsichtbar machen würde — beides
       trägt zur Lesbarkeit des Nachweises bei. 'exact' zwingt Puppeteer +
       Print-Engines, das CSS-Color treu zu rendern. */
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
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
    /* Deutsche Silbentrennung für Fließtext (Themen, Namen) — bricht lange
       Komposita an Silbengrenzen. Greift nur mit lang="de" am Sheet.
       overflow-wrap bleibt als Fallback für untrennbare Tokens (z.B. URLs). */
    hyphens: auto;
    -webkit-hyphens: auto;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .sheet th { background: #f3f3f3; font-weight: 600; }
  .sheet td.num { text-align: right; }
  /* Kurze Festwert-Spalten (Datum, Modus) nie umbrechen — verhindert
     hässliche Mid-Word-Breaks wie „Präsen z". */
  .sheet td.nowrap {
    white-space: nowrap;
    hyphens: manual;
    -webkit-hyphens: manual;
  }
  .sheet tfoot td { font-weight: 600; background: #fafafa; }
  .sig-box { display: block; }
  .sig-box img {
    display: block;
    /* 14mm gibt der getrimmten Signatur (siehe signature-canvas.tsx)
       genug Höhe, um klar lesbar zu sein. Vorher 12mm wirkte mit
       ungetrimmten PNGs vertretbar; mit Trim wäre 12mm verschenkt. */
    max-height: 14mm;
    max-width: 100%;
    object-fit: contain;
    /* Image-Rendering hint: Browser sollen die Signatur nicht
       weichzeichnen — eine handschriftliche Linie verträgt Pixel-Schärfe
       besser als Anti-Aliasing-Blur. */
    image-rendering: -webkit-optimize-contrast;
  }
  .sig-timestamp {
    display: block;
    margin-top: 0.5mm;
    font-size: 7.5pt;
    color: #555;
  }
  .sig-pending { color: #999; font-style: italic; font-size: 9pt; }
  /* Kompetenzteams: Coach-Name pro Zeile (nur bei >1 Coach gerendert). */
  .sig-coach-name {
    font-size: 7.5pt;
    font-weight: 600;
    color: #333;
    margin-bottom: 0.5mm;
  }
  .sheet-audit {
    margin-top: 6mm;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sheet-audit table { margin-top: 1mm; }
  .sheet-audit th, .sheet-audit td { font-size: 8pt; padding: 1.5mm; }
  .sheet-audit-intro {
    margin: 0 0 1mm 0;
    color: #555;
    font-size: 8.5pt;
  }
  .sheet .mono {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 7.5pt;
  }
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

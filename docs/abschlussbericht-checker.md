# Abschlussbericht-Checker — Setup, Architektur & Compliance

Arbeitsdokument für die Einführung des Abschlussbericht-Checker-Moduls in Signflow. Enthält Produktentscheidung, Ziel-Architektur, Compliance-Paket, und einen Schritt-für-Schritt-Onboarding-Plan, den wir gemeinsam abarbeiten.

**Status:** In Setup. Erstellt am 2026-04-21.

---

## 1. Produktentscheidung

Der Abschlussbericht-Checker ist ein **eigenständiges Modul** innerhalb von Signflow, bewusst **getrennt vom Signatur-Tool**.

**Warum getrennt:**
- Checker verarbeitet Art.-9-Daten (Gesundheit) und Sozialdaten im AVGS-Kontext → ganz andere Compliance-Last (DSFA Pflicht, Art.-9-Rechtsgrundlage, strengere Datenflüsse)
- Signatur-Tool hat diese Datenkategorien nicht
- Getrennte Module verhindern, dass das Signatur-Modul unnötig Art.-9-Compliance mitschleppt
- AVV mit Bildungsträgerin wird modular gestaltet (Anlage 1: Signatur, Anlage 2: Checker)
- Getrennte Rollout-Timelines möglich (Checker kann zuerst live)
- Unterschiedliche Käufer-Persona (Checker richtet sich primär an die QS-Mitarbeiterin der Bildungsträgerin)

**Rollout-Strategie:**
- **Checker-Modul:** für alle registrierten Coaches sofort sichtbar bei Go-Live
- **Signatur-Modul:** per User-Feature-Flag `signing_enabled` (default `false`) — nur 3–4 Pilot-Coaches bekommen den Flow zuerst, um Bugs zu sammeln, bevor breiter Rollout

---

## 2. Ziel-Architektur

**Leitprinzip: Rohdaten berühren niemals US-Infrastruktur.**

```text
┌──────────────────┐
│  Coach-Browser   │
│                  │
│  • Hält Rohtext  │
│  • Hält Mapping  │
└────────┬─────────┘
         │ Rohtext (HTTPS)
         ▼
┌──────────────────────────────┐
│  anon.signflow.de            │
│  IONOS Compute VM (Frankfurt)│
│                              │
│  ① Regex  (Strukturen)       │
│  ② GLiNER (Namen/Orte, lokal)│
│  ③ Llama 3.3 70B (Residual,  │
│     via IONOS AI Model Hub)  │
└────────┬─────────────────────┘
         │ anonymisierter Text + Mapping
         ▼
┌──────────────────┐
│  Coach-Browser   │
└────────┬─────────┘
         │ NUR anonymisierter Text
         ▼
┌──────────────────────────────┐
│  Vercel (Next.js API)        │
│  app.signflow.de             │
│                              │
│  Auth, Routing, Orchestrierung│
└────────┬─────────────────────┘
         │ anonymisierter Text
         ▼
┌──────────────────────────────┐
│  Azure OpenAI EU             │
│  (Sweden Central oder        │
│   Germany West Central)      │
│                              │
│  Regel-Check gegen Katalog   │
└────────┬─────────────────────┘
         │ Feedback (Platzhalter-Referenzen)
         ▼
┌──────────────────┐
│  Coach-Browser   │
│                  │
│  Mapped Feedback │
│  auf Original    │
└──────────────────┘
```text

**Wer sieht was (Zielarchitektur mit Azure-Wiring):**

| Komponente | Sieht Rohdaten | Sieht anonymisierte Daten | Sieht Metadaten |
|---|---|---|---|
| Coach-Browser | Ja (lokal) | Ja | Ja |
| IONOS Compute VM (Frankfurt) | Ja (transient, RAM) | Ja | Nein |
| IONOS AI Model Hub | Nur Residual-Fälle | – | Nein |
| Vercel | **Nein** (nur orchestrierende Requests) | Ja | Ja |
| Azure OpenAI EU | **Nein** | Ja | – |
| Neon | **Ja — nach bestandenem AMDL-Gate**: persistierte BER-Inhalte (`teilnahme/ablauf/fazit`) + Metadaten + Audit-Log | – | Ja |

> Hinweis: Die Neon-Persistenz ist **nach dem harten Compliance-Gate** zulässig — submittete BERs sind per Design Art.-9-frei (siehe § 14). Während der Editier-Phase bleiben Rohdaten clientseitig, der Server speichert erst beim Submit die gate-geprüfte Version.

---

## 3. Warum kein Browser-Direkt an IONOS

Ursprünglich geplant: Browser ↔ IONOS AI Model Hub direkt. **Recherche-Ergebnis: nicht machbar.**

Drei harte Blocker:
1. **CORS nicht dokumentiert/konfigurierbar** im AI Model Hub (im Gegensatz zu IONOS Object Storage, wo CORS explizit dokumentiert ist → Feature-Lücke, kein Dokumentationsausfall)
2. **Keine scoped/kurzlebigen Tokens** — jeder IONOS-Token ist ein Voll-Account-Token mit Rechnungszugriff, kein OAuth-Token-Exchange
3. **Kein Community-Präzedenzfall** — alle dokumentierten IONOS-AI-Integrationen sind Server-to-Server

**Lösung:** Thin Node-Proxy auf IONOS Compute Engine vCPU (Frankfurt, ~€5/Monat). Der Proxy hält den IONOS-Token, setzt CORS für `https://signflow.de`, forwarded bei Bedarf zu `openai.inference.de-txl.ionos.com`. Rohtext verlässt nie Deutschland.

---

## 4. Anonymisierungs-Strategie (Hybrid, 3-stufig)

Reine LLM-Anonymisierung mit Llama 3.1 8B reicht **nicht** (~86% Accuracy + Halluzinationen/Over-Redaction). Stattdessen Hybrid auf der Proxy-VM:

**Stufe 1 — Regex (deterministisch, 1:1-mappbar)**
- Deutsche Postleitzahlen (5 Ziffern)
- Daten (verschiedene Formate: `01.02.26`, `2026-04-21`, etc.)
- Telefonnummern
- IBAN
- E-Mail-Adressen
- Kunden-Nummern (AVGS-Schema: `357A123451_1`)

**Stufe 2 — GLiNER lokal (deterministisch, 1:1-mappbar, ~95% DE-PII-Accuracy)**
- Modell: `VAGOsolutions/SauerkrautLM-GLiNER` oder `knowledgator/gliner-pii-base-v1.0` (MIT-Lizenz)
- Deckt ab: Namen, Orte, Organisationen
- Läuft lokal auf IONOS-VM, kein weiterer Cloud-Call

**Stufe 3 — Llama 3.3 70B auf IONOS AI Model Hub (nur Residual)**
- Prompt: „Finde in folgendem bereits teilredigierten Text noch übersehene Personenreferenzen oder kontextuelle Bezüge (z.B. ‚meine Nachbarin Frau X', ‚der Teilnehmer')"
- Rückgabe: strukturierte Liste gefundener Stellen
- Risiko der Halluzination ist gering, da Input schon 95%+ sauber
- Kosten minimal, da nur Residual-Calls

**Nicht verwendet:** Llama 3.1 8B (zu schwach), Teuken 7B (wird am 16.04.2026 abgeschaltet).

---

## 5. Codebase-Struktur

App liegt unter `app/` (App Router, kein `src/app/`). Auth via bestehendes `requireCoach()` aus `src/lib/dal.ts`.

### Neue Dateien

```text
app/coach/checker/                      [NEW]
├── layout.tsx                          (optional, erbt von app/coach/layout.tsx)
├── page.tsx                            Dashboard: „Bericht prüfen" Button + Historie
├── check/
│   ├── page.tsx                        Upload-Form
│   └── form.tsx                        Client-Component: File-Upload + Anonymisierung + Check
└── actions.ts                          Server Actions (Stats, Audit-Log-Writes)

app/api/checker/                        [NEW]
├── ionos-token/route.ts                Token-Exchange (kurzlebiger Proxy-Token für anon.signflow.de)
├── check/route.ts                      POST: anonymisierter Text → Azure OpenAI EU → Feedback
└── log/route.ts                        POST: Metadaten-Logging (keine Inhalte!)
```text

### Geänderte Dateien

```text
app/coach/layout.tsx                    NavLink „Abschlussbericht-Checker" hinzufügen
src/lib/audit.ts                        Neuer Event-Typ: checker.report_submitted
```text

### Separates Repo

```text
signflow-anon-proxy/                    [NEW REPO]
├── server.ts                           Express/Fastify: CORS + Auth + Pipeline
├── pipeline/
│   ├── regex.ts                        Stufe 1: deterministisch
│   ├── gliner.ts                       Stufe 2: GLiNER-Inference (via ONNX/Python-Subprocess)
│   └── llm-residual.ts                 Stufe 3: IONOS AI Model Hub Fallback
├── Dockerfile
└── deploy.sh                           SSH-Deploy auf IONOS-VM
```text

### DB-Entscheidung (überholt — siehe § 14)

Ursprüngliche Annahme war „stateless, nur Audit". Mit dem Workflow-Update in § 14 gibt es jetzt eine Tabelle `abschlussberichte`, die submittete BER-Inhalte persistiert. Diese sind per AMDL-Gate **Art.-9-frei**, Speicherung damit auf Art. 6(1)(b) DSGVO gestützt. Draft-Entwürfe liegen weiterhin client-seitig (localStorage bzw. Server-Autosave im scoped Editor — in beiden Fällen gate-geprüft beim Submit).

Audit-Events:
- `ber.draft_saved` — beim Autosave eines bestehenden oder neuen Entwurfs
- `ber.submitted` — beim finalen Einreichen an die Bildungsträgerin
- `ber.edited_after_submit` — bei Änderungen eines bereits eingereichten BER

---

## 6. Compliance-Paket — Checkliste

### Auftragsverarbeitungsverträge (AVV) nach Art. 28 DSGVO

Datenverarbeitende Dienstleister, mit denen AVV vorliegen muss:

- [ ] **IONOS** (AI Model Hub + Compute) — im Cloud-Panel oder per Support-Ticket
- [ ] **Vercel** (Hosting) — Dashboard → Team Settings → Legal
- [ ] **Neon** (DB) — Dashboard oder `legal@neon.tech`
- [ ] **Microsoft Azure** (AI) — Microsoft Products & Services DPA
- [ ] **Resend** (E-Mail) — Dashboard → Legal
- [ ] **Firma.dev** (FES) — per Support
- [ ] **Storage-Anbieter** (sobald entschieden: Cloudflare R2 oder Vercel Blob)
- [ ] **Bildungsträgerin ↔ Signflow** — bilateraler AVV mit modularem Anlagenaufbau

### Datenschutz-Folgenabschätzung (DSFA) nach Art. 35 DSGVO

- [ ] Vorlage wählen (BfDI-Standardmodell oder DSK Kurzpapier Nr. 5)
- [ ] Bausteine aus Abschnitt 9 einfügen
- [ ] Risikobewertung + Abhilfemaßnahmen ergänzen
- [ ] Durch DSB der Bildungsträgerin oder externen Fachanwalt/DSB-Dienstleister gegenprüfen lassen
- [ ] In beiden Systemen archivieren

### Datenschutzerklärung (öffentlich, vor Go-Live)

- [ ] Verantwortlicher + Kontakt
- [ ] DSB benennen (falls erforderlich — bei regelmäßiger Art.-9-Verarbeitung wahrscheinlich Pflicht)
- [ ] Zwecke + Rechtsgrundlagen **pro Modul getrennt**
- [ ] Datenkategorien
- [ ] Empfänger-Liste
- [ ] Drittland-Übermittlung + SCCs
- [ ] Speicherdauer
- [ ] Betroffenenrechte
- [ ] Veröffentlicht unter `signflow.de/datenschutz`
- [ ] Link im Footer jeder Seite

**Nicht aus Generator ziehen** — Art.-9-Spezifika brauchen fachliche Hand.

### Technische und Organisatorische Maßnahmen (TOM)

- [ ] TLS-Verschlüsselung in Transit (überall)
- [ ] Verschlüsselung At-Rest (Neon, Storage)
- [ ] Zugriffskontrolle + MFA für Admin-Accounts
- [ ] Protokollierung (Audit-Log)
- [ ] Löschkonzept dokumentiert
- [ ] Backup-Strategie dokumentiert
- [ ] Incident-Response-Prozess dokumentiert
- [ ] TOM-Anhang zum AVV mit Bildungsträgerin

---

## 7. Onboarding-Plan

### Phase 1 — Sofort (diese Woche)

- [ ] **IONOS Cloud Account anlegen** (nicht IONOS Webhosting — andere Produktlinie)
- [ ] **Zahlungsmittel hinterlegen**
- [ ] **AI Model Hub Token erzeugen** (Data Center Designer → Management → Token Manager, TTL 1 Jahr, sofort in Passwort-Manager)
- [ ] **Testcall** via curl gegen `https://openai.inference.de-txl.ionos.com/v1/chat/completions`
- [ ] **IONOS AVV anfordern** (Cloud-Panel → Compliance oder per Ticket)
- [ ] **Compute Engine vCPU-Instanz erstellen** — Standort Frankfurt (de/fra) oder Berlin (de/txl), kleinste vCPU
- [ ] **DNS** — Subdomain `anon.signflow.de` als A-Record auf VM-IP
- [ ] **TLS** via Caddy (automatisch Let's Encrypt)
- [ ] **Regelkatalog von Erango einholen** (angefragt am 2026-04-21)
- [ ] **AVV-Template von Erango anfordern**

### Phase 2 — Vor erstem Kundenkontakt (1–2 Wochen)

- [ ] AVV mit Vercel
- [ ] AVV mit Neon
- [ ] AVV mit Microsoft Azure
- [ ] AVV mit Resend
- [ ] AVV mit Firma.dev
- [ ] Storage-Anbieter entscheiden + AVV
- [ ] AVV mit Bildungsträgerin finalisieren (modular: Anlage 1 Signatur, Anlage 2 Checker)
- [ ] TOM-Anhang zusammenstellen
- [ ] DSFA schreiben + DSB gegenprüfen lassen
- [ ] Datenschutzerklärung (durch Fachhand) erstellen
- [ ] Rechts-Review einmalig beauftragen **oder** Erangos DSB fragen
- [ ] Prüfen, ob DSB-Benennung für Signflow UG Pflicht ist

### Phase 3 — Technische Umsetzung Checker

- [ ] Separates Repo `signflow-anon-proxy` für IONOS-VM-Code anlegen
- [ ] Proxy-Server mit Stufe-1-Regex implementieren
- [ ] GLiNER lokal integrieren (via ONNX oder Python-Subprocess)
- [ ] Llama-3.3-70B-Residual-Call gegen IONOS AI Model Hub
- [ ] Deploy-Skript für IONOS-VM
- [ ] In Signflow: `app/coach/checker/`-Routen bauen
- [ ] `app/api/checker/*`-Endpunkte (Token-Exchange, Azure-Check, Audit-Log)
- [ ] Client-seitiger Upload + Anonymisierungs-Aufruf + Feedback-Mapping
- [ ] Nav-Link in Coach-Layout
- [ ] Azure OpenAI EU Deployment (Region Sweden Central oder Germany West Central)
- [ ] Regelkatalog als System-Prompt strukturieren (sobald von Erango da)

### Phase 4 — Pilot + Launch

- [ ] End-to-End-Test mit Erango-QS-Mitarbeiterin
- [ ] Feedback-Runde
- [ ] Go-Live Checker-Modul
- [ ] Signatur-Modul bleibt versteckt hinter `signing_enabled`-Flag
- [ ] Pilot-Coaches für Signatur-Modul auswählen (3–4)

---

## 8. Offene Fragen / zu verifizieren

- [ ] **Rechtsgrundlage** final bestätigen lassen (Art. 9(2)(b) vs. (g)) — durch Erangos DSB
- [ ] **DSB-Pflicht** für Signflow UG prüfen (bei regelmäßiger Art.-9-Verarbeitung wahrscheinlich)
- [ ] **Storage-Anbieter** final: Cloudflare R2 vs. Vercel Blob (aktuell Vercel Blob, siehe TODO.md)
- [ ] **Azure-Region** festlegen: Sweden Central (mehr OpenAI-Modelle) vs. Germany West Central (näher)
- [ ] **Agency-Rolle umbenennen** auf „Bildungsträger" (siehe separate Memory)
- [ ] **Scope-Entscheidung ANW vs. BER** (siehe § 12, Regelkatalog ist da)
- [ ] **Input-Format** für Checker: nur Text-Paste, oder auch PDF-Upload?

---

## 14. Update 2026-04-22: Persistierter BER-Workflow + Agency-Sicht

Der Checker ist kein Standalone-Tool mehr — er ist jetzt in den Kurs-Graph integriert. Coach schreibt BER je Teilnehmer, reicht ein, Bildungsträger sieht Fortschritt.

### Neu

- **Tabelle `abschlussberichte`** (Enum `ber_status: draft | submitted`) — 1:1 pro (Kurs, TN)
- **BER-Editor-Route** `/coach/courses/[id]/teilnehmer/[tnId]/bericht` — Server-Actions `saveBerDraftAction` (Autosave) + `submitBerAction` (harter Gate: nur einreichen, wenn finale Prüfung pass)
- **Coach-Kurs-Detail** zeigt je TN zwei Status-Badges: ANW (bestehend) + BER (neu)
- **Coach-Dashboard `/coach/checker`** zeigt Cross-Course-Übersicht: „fehlen noch / Entwurf / eingereicht" mit Zähler + Listen
- **Agency-Dashboard `/agency`** hat neue Sektion „Abschlussberichte — Fortschritt" pro Kurs (grün/gelb/grau + %-Angabe)
- **Audit-Events**: `ber.draft_saved`, `ber.submitted`, `ber.edited_after_submit`

### Edit-nach-Einreichung

Bewusst erlaubt: auch nach `submit` kann der Coach weiterschreiben. Änderungen werden als `ber.edited_after_submit` geloggt, Status bleibt `submitted`, `updated_at` läuft hoch. Die BER-Editor-UI zeigt einen Emerald-Banner „bereits eingereicht am X — Änderungen werden gespeichert".

### DSGVO-Rechtfertigung für die neue Persistenz

Der Checker wird zum **harten Gate**: `submitBerAction` erlaubt den Schreibvorgang nur, wenn die finale Prüfung `lastCheckPassed = true` meldet. Damit sind gespeicherte BERs **per Design frei von Art.-9-Daten** (Gesundheit etc.) — sonst wären sie gar nicht durchgekommen.

Was in Neon landet:
- **Erlaubt**: Name, Kunden-Nr., E-Mail, Coaching-Freitext (Pflichtbausteine, Handlungsperspektiven, Tonalität)
- **Per Design ausgeschlossen**: Gesundheitsdaten, Diagnosen, Therapie-Empfehlungen, Charakter-Bewertungen, Motivunterstellungen, Pathologisierung

Legal-Basis dieser Speicherung: **Art. 6 Abs. 1 lit. b DSGVO** (Vertragserfüllung — Coach → Bildungsträger → AfA-Dokumentation). Art. 9(2)(b) ist hier nicht mehr einschlägig, weil keine besondere Kategorie mehr verarbeitet wird.

Die Anonymisierungs-Pipeline (IONOS → Azure) bleibt für den Checker-Schritt erforderlich, weil dort **vor** dem Gate noch Art.-9-Formulierungen im Entwurf stehen können.

### DSFA-Auswirkung

- Zusätzliche Datenkategorie in der DSFA: „Gespeicherte BER-Inhalte (Art. 6 lit. b, Stammdaten + Coaching-Text nach Qualitätssicherung)"
- Empfänger-Liste um Neon (Hosting AWS Frankfurt) erweitern — war schon drin für Kurs-/Session-Daten
- Aufbewahrungsdauer BER-Inhalte: an Kurs-Lebenszyklus koppeln, typisch Archivfrist der Bildungsträgerin (idR 10 Jahre nach AfA-Abrechnung gemäß Aufbewahrungspflichten)
- Löschkonzept: BER wird per `ON DELETE CASCADE` beim Kurs-Löschen mitgelöscht; soft-delete auf BER selbst nicht implementiert (bewusst)

### Noch offen

- [ ] Email-Send an Bildungsträger-Postfach bei `submit` (Resend) — optional, Nutzerwunsch
- [ ] Agency-Detail-View für einzelne BERs (lesen/read-only) — aktuell nur Aggregat-Fortschritt
- [ ] Metadaten-Form-Felder (AVGS-Maßnahme etc.) im BER-Export-Layout
- [ ] Aufbewahrungsfrist für submitted BERs + automatische Löschung

---

## 13. Update 2026-04-22: UX-Redesign — kein PDF-Upload

Beim ersten Praxistest (Erango F-11-Template) ist aufgefallen, dass PDF-Upload aus mehreren Gründen der falsche Weg ist:

1. **DSGVO-Surface**: Jede zusätzliche Datenquelle (Upload, Paste, Manuell) erweitert unsere Verantwortungsfläche — auch wenn die Daten im Browser bleiben. Wir designen und instruieren die Verarbeitung, also sind wir (Co-)Verantwortliche. Weniger ist mehr.
2. **Technik**: Das F-11-Template ist ein XFA-Form. PDF.js kann den Body-Text nicht extrahieren, selbst mit `enableXfa: true` + `getFieldObjects()`. Der Rohtext enthält nur Header/Fußzeilen. Scans und handschriftliche Berichte wären ein weiterer Edge-Case (OCR).
3. **Wertbeitrag**: Der eigentliche Nutzen entsteht nicht beim Prüfen, sondern **während des Schreibens** — als Live-Grammatikchecker für erango-Compliance.

### Neuer Primär-Flow

- Coach schreibt den Bericht **direkt in Signflow** (3 Textareas: Teilnahme / Ablauf / Fazit)
- Live-Feedback-Sidebar zeigt, was schon passt und was nicht:
  - Must-Have-Checkliste (6 Pflichtbausteine), hakt sich live ab
  - Violations-Liste (verbotene Begriffe), aktualisiert beim Tippen
  - Tonalitäts-Hinweis bei wertender Sprache
- „Bericht final prüfen"-Button → Progress-Animation → vollständiges Feedback + Umformulierungs-Vorschläge
- **Phase 2**: Signflow generiert die fertige Erango-PDF per Puppeteer (HTML-as-Source-of-Truth-Pattern analog zum ANW-Stundennachweis)

### Sekundär-Flow (optional)

Für bestehende Berichte (z.B. aus Word kopiert): kleine Paste-Box unter den Textareas, aufklappbar. Text einfügen → auto-split per Header-Regex → Felder werden befüllt → ab da gleicher Flow.

### Was entfernt wurde

- `src/lib/checker/pdf-extract.ts` (PDF.js + enableXfa + getFieldObjects + Text-Split)
- `src/components/checker/pdf-upload-button.tsx`
- `pdfjs-dist` npm-Dependency

### Was neu ist

- `src/components/checker/live-feedback.tsx` — die Sidebar mit Live-Bewertung
- `src/lib/checker/split-text.ts` — Header-basierter Splitter (aus pdf-extract rausgelöst, ohne PDF-Code)
- 2-spaltiges Layout auf Desktop (Form links, Sidebar rechts), einspaltig auf Mobile

### Auswirkung auf Compliance-Paket

**Reduziert:**
- PDF-Extraktion weg → ein potenzieller Verarbeitungsschritt weniger in der DSFA

**Gleich:**
- Art.-9-Verarbeitung beim Prüfen bleibt bestehen (Regelcheck muss ja Gesundheitsbegriffe finden)
- Anonymisierungs-Pipeline über IONOS bleibt erforderlich für den finalen Prüf-Call

---

## 12. Update 2026-04-21: Regelkatalog erhalten

Regelkatalog von Erango ist da (siehe `docs/checker-rules.md`). Drei wichtige Klärungen:

### ANW vs. BER — Scope-Entscheidung

Der Leitfaden deckt **zwei** Dokument-Typen ab:
- **ANW (Anwesenheitsliste)**: rein deterministische Regeln (keine Sonntage, kein Samstag als Start, 2 Termine/Woche, Datum im Bewilligungszeitraum, UE-Summen-Logik)
- **BER (Abschlussbericht)**: inhaltliche + tonale Regeln — genau das, wofür wir AI brauchen

**Empfehlung:** Checker-Modul deckt **nur BER** ab. ANW-Validierung gehört in das Signature-Tool (bei Session-Create Real-Time-Warnung, auf Course-Dashboard aggregierte Hinweise) — keine AI nötig, pures Business-Rule-Validation. Signflow ist ohnehin die Source-of-Truth der ANW-Daten.

Vorteil: Checker bleibt fokussiert + schneller fertig. ANW-Regeln fließen natürlich in Signature-Tool ein, wenn wir da weiterbauen.

### Input-Format Empfehlung: Plain-Text-Paste

Coach fügt Report-Text ein (oder 3 Textareas analog zum Formular: Teilnahme/Mitarbeit, Ablauf, Fazit). PDF-Upload mit Text-Extraktion später ergänzbar. Vorteil: simpler MVP, tolerant gegen Template-Änderungen.

### Output-Format: Erango hat es diktiert

Die Results-Page rendert:
1. **Status** (Freigabe / Überarbeitung)
2. **Must-Have-Coverage** (Checkliste: Profiling ✓, Zielarbeit ✓, Strategie ✗ …)
3. **Violations** (pro Fund: Kategorie, Zitat aus Original, Regel, Umformulierungs-Vorschlag)
4. **Tonalitäts-Feedback**

JSON-Schema-Entwurf in `docs/checker-rules.md` § 4.

---

## 9. DSFA — Bausteine zum Einfügen

### 9.1 Zweck der Verarbeitung

> Automatisierte Qualitätssicherung von TN-bezogenen AVGS-Abschlussberichten vor deren Einreichung bei der Agentur für Arbeit. Das System prüft Berichtsentwürfe gegen den Regelkatalog der Bildungsträgerin und gibt dem Coach strukturiertes Feedback zu unzulässigen Inhalten. Ziele: (1) Reduktion manueller Korrekturschleifen zwischen Coach und Qualitätssicherungs-Stelle der Bildungsträgerin, (2) Vermeidung unzulässiger Inhalte (insbesondere Gesundheitsdaten, Charakterurteile, motivbezogene Unterstellungen) bereits vor Einreichung, (3) Absicherung der AVGS-Konformität und damit der Abrechnungsfähigkeit gegenüber der Agentur für Arbeit.

### 9.2 Verarbeitete Datenkategorien

**Rohdaten (ausschließlich im Browser der verantwortlichen Stelle und auf IONOS-Compute-VM in Deutschland; keine Persistenz):**
- Stammdaten der Teilnehmer:innen (Name, Anschrift, Kunden-Nr., Maßnahmen-Zeitraum)
- Stammdaten der Coaches (Name, Kontaktdaten)
- AVGS-Maßnahmen-Bezug
- Inhaltliche Coachingtexte (Teilnahme/Mitarbeit, Ablauf/Inhalte, Fazit/Empfehlungen)
- Potenziell besondere Kategorien nach Art. 9 DSGVO (Gesundheitsdaten, sofern vom Coach unzulässig in den Entwurf aufgenommen — deren Identifikation und Entfernung ist gerade Zweck der Verarbeitung)
- Potenziell Sozialdaten nach § 67 SGB X im AVGS-Kontext

**Nach Anonymisierung weitergegebene Daten (Azure/Prüfungs-Schritt):**
- Anonymisierter Berichtstext mit Platzhaltern (`[NAME_1]`, `[ORT_1]`, `[KUNDEN_NR_1]`, …)
- Platzhalter→Original-Mapping bleibt ausschließlich im Browser der verantwortlichen Stelle

**Nach erfolgreichem AMDL-Gate in Neon (EU) persistierte Daten:**
- BER-Inhalte (`teilnahme`, `ablauf`, `fazit`) — per Design Art.-9-frei, da Submit nur bei bestandener Regelprüfung zulässig
- Stammdaten-Bezüge (course_id, participant_id, coach_id, submitted_at)
- Audit-Log-Einträge (`ber.submitted`, `ber.edited_after_submit`, …)
- Rechtsgrundlage für die Speicherung: **Art. 6 Abs. 1 lit. b DSGVO** (Vertragserfüllung). Art. 9 nicht mehr einschlägig, weil keine besonderen Kategorien mehr verarbeitet werden.

### 9.3 Rechtsgrundlage

**Primär: Art. 9 Abs. 2 lit. b DSGVO** in Verbindung mit § 22 Abs. 1 Nr. 1 lit. b BDSG — die Verarbeitung ist erforderlich, damit die Bildungsträgerin (als Verantwortliche) den aus dem Recht der sozialen Sicherheit und des Sozialschutzes erwachsenden Pflichten nachkommen kann (Dokumentations- und Berichtspflichten gegenüber der Agentur für Arbeit im Rahmen der Durchführung von AVGS-Maßnahmen nach SGB III).

**Sekundär: Art. 6 Abs. 1 lit. b DSGVO** — Vertragserfüllung im Dienstleistungsverhältnis zwischen Bildungsträgerin und der Signflow UG (haftungsbeschränkt) als Auftragsverarbeiter.

**Alternative (falls lit. b nicht trägt):** Art. 9 Abs. 2 lit. g DSGVO (erhebliches öffentliches Interesse) in Verbindung mit landesrechtlichen Grundlagen zur Arbeitsmarktintegration.

Finale Zuordnung durch DSB der Bildungsträgerin.

### 9.4 Empfänger / Auftragsverarbeiter

**Empfänger der Rohdaten (möglicher Personenbezug nach Art. 9):**

| Empfänger | Rechtsraum | Zweck | Rechtsgrundlage |
|---|---|---|---|
| IONOS SE, Karlsruhe | Deutschland | Pseudonymisierung via Compute-VM + AI Model Hub | Art. 28 DSGVO (AVV) |

Keine weiteren Empfänger. Insbesondere keine Übermittlung von Rohdaten an Vercel Inc., Neon Inc., Microsoft Corporation oder Amazon Web Services.

**Empfänger der anonymisierten Daten (kein Personenbezug):**

| Empfänger | Rechtsraum / Region | Zweck | Drittland-Rechtsgrundlage |
|---|---|---|---|
| Vercel Inc. | USA, Edge-Region EU | Hosting der Anwendung | SCCs + Art. 28 DSGVO |
| Microsoft Ireland Operations Ltd. / Azure OpenAI | EU (Sweden Central **oder** Germany West Central) | Regelprüfung auf anonymisiertem Text | SCCs + Art. 28 DSGVO |
| Neon Inc. | USA, Hosting in AWS Frankfurt | Metadaten-Persistenz (keine Berichtsinhalte) | SCCs + Art. 28 DSGVO |

### 9.5 Aufbewahrungsdauer

| Datenart | Speicherort | Dauer | Löschmechanismus |
|---|---|---|---|
| Rohbericht (Art. 9 möglich) | Browser + IONOS-VM (RAM) | Transient, < 30 Sekunden | Automatisch nach Verarbeitung (kein Disk-Write) |
| Platzhalter-Mapping | Browser-Session | Bis Session-Ende | Browser-Cleanup beim Tab-Close |
| Anonymisierter Text | Browser + Azure-Request-Buffer | Transient während Regelprüfung | Azure Data Residency, keine persistenten Logs |
| Regel-Feedback (anonymisiert) | Browser | Bis Session-Ende | – |
| Metadaten (Nutzungsstatistik) | Neon EU | 30 Tage | Automatisierte Löschung (Cron/DB-Trigger) |
| Audit-Log-Einträge (ohne Berichtsinhalt) | Neon EU | 12 Monate | Automatisierte Löschung |

---

## 10. Nächste Schritte

**Du bis morgen:**
1. IONOS Cloud Account anlegen + Token generieren
2. Regelkatalog von Erango einholen
3. AVV-Template von Erango anfordern

**Ich kann sofort loslegen mit:**
1. Routen-Gerüst `app/coach/checker/*` (Dashboard, Upload, Results)
2. Token-Exchange-Endpunkt `app/api/checker/ionos-token`
3. Audit-Log-Event-Typ `checker.report_submitted` in `src/lib/audit.ts`
4. Separates Proxy-Repo-Skelett `signflow-anon-proxy` (Express + Regex-Stufe)

Die eigentliche Regelprüfung (System-Prompt für Azure) erst bauen, wenn der Regelkatalog da ist.

---

## 11. Referenzen

- IONOS AI Model Hub: [docs.ionos.com/cloud/ai/ai-model-hub](https://docs.ionos.com/cloud/ai/ai-model-hub/)
- IONOS Preise: [cloud.ionos.com/prices](https://cloud.ionos.com/prices)
- GLiNER (MIT): [github.com/urchade/GLiNER](https://github.com/urchade/GLiNER)
- SauerkrautLM-GLiNER: [huggingface.co/VAGOsolutions/SauerkrautLM-GLiNER](https://huggingface.co/VAGOsolutions/SauerkrautLM-GLiNER)
- Microsoft Presidio (Referenz-Architektur): [github.com/microsoft/presidio](https://github.com/microsoft/presidio)
- BfDI: [bfdi.bund.de](https://www.bfdi.bund.de/)

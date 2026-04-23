# Signflow — Roadmap

Strategische Statusübersicht über die gesamte Software. Komplementär zu [TODO.md](TODO.md) (feingranulare Tasks) und [docs/abschlussbericht-checker.md](docs/abschlussbericht-checker.md) (Checker-Deepdive).

**Stand:** 2026-04-23

---

## ✓ Fertig (produktionsreif bzw. MVP-level)

### Signature-Tool (Stundennachweis-Flow)

- [x] Auth via Better Auth (Coach-Invite, Passwort-Reset, Agency-Impersonation mit Write-Block)
- [x] Kurs-Anlage mit AVGS-Nr., Bedarfsträger, UE-Kontingent, Durchführungsort
- [x] Teilnehmer einschreiben
- [x] Sessions + Erstgespräch-Sonderlogik
- [x] Coach-Signatur einmalig erfasst + Sessions bestätigen
- [x] Kurs-scoped Magic Links für Teilnehmer (24 h, re-issue-safe)
- [x] TN-Signatur + Preview-Flow + Freigabe
- [x] FES-Seal (Firma.dev **gemockt**) + AfA-Submission
- [x] PDF-Generierung via Puppeteer (HTML-as-Source-of-Truth)
- [x] Audit-Log mit polymorphem Actor
- [x] Landing-Page mit Pricing + FAQ + Waitlist

### Abschlussbericht-Checker (MVP)

- [x] 3-Textarea-Editor mit Live-Feedback (Regex-Dummy)
- [x] localStorage-Autosave für Ad-hoc, Server-Autosave für scoped BERs
- [x] Paste-Text-Fallback mit Header-Split
- [x] 4-Stufen-Progress-Animation + Verdict-Karte
- [x] Must-Have-Checkliste + Violations-Liste mit Umformulierungs-Vorschlägen
- [x] Erango-PDF-Layout + Client-side Export (`window.print()`)
- [x] DB-Persistenz (`abschlussberichte`-Tabelle, 1:1 pro Kurs × TN)
- [x] BER-Editor je Teilnehmer (scoped, Autosave, Submit-Gate)
- [x] Cross-Course Coach-Dashboard
- [x] Agency-BER-Fortschritts-Sektion (aggregiert pro Kurs)
- [x] Audit-Events für BER-Submit/Edit
- [x] Regelkatalog als Markdown-Referenz, System-Prompt fürs spätere Azure-Wiring

### Infrastruktur & Docs

- [x] Next.js 16 + App Router + TypeScript + Tailwind + Drizzle + Neon + Vercel
- [x] `.env.development.local` für Localhost-Overrides ohne Prod-Impact
- [x] Arbeits-Doc [docs/abschlussbericht-checker.md](docs/abschlussbericht-checker.md)
- [x] Regelkatalog [docs/checker-rules.md](docs/checker-rules.md)
- [x] Architektur-Entscheidungen in Memory persistiert

---

## 🔴 Muss vor Pilot/Demo mit Erango

### DSGVO / Compliance

- [ ] **DSGVO-Hardcore-Review** (angekündigt, kommt als Nächstes)
- [ ] AVV mit **IONOS** (Cloud-Panel)
- [ ] AVV mit **Vercel**
- [ ] AVV mit **Neon**
- [ ] AVV mit **Microsoft Azure** (Products & Services DPA)
- [ ] AVV mit **Resend**
- [ ] AVV mit **Firma.dev** (per Support)
- [ ] AVV mit Storage-Anbieter (Vercel Blob → später R2/S3)
- [ ] AVV mit **Bildungsträgerin Erango** (modular: Anlage 1 Signatur, Anlage 2 Checker)
- [ ] **DSFA** nach Art. 35 DSGVO (Bausteine stehen in docs/abschlussbericht-checker.md § 9)
- [ ] **Datenschutzerklärung** öffentlich auf `signflow.de/datenschutz` (nicht aus Generator)
- [ ] **TOM** dokumentieren (Verschlüsselung, Zugriff, Löschkonzept, Incident-Response)
- [ ] DSB-Benennungs-Pflicht für Signflow UG prüfen
- [ ] **Rechts-Review einmalig** (Fachanwalt IT oder Erangos DSB)

### AI-Wiring (Checker auf „richtig" umstellen)

- [ ] IONOS Cloud Account + API-Token (Data Center Designer → Token Manager)
- [ ] IONOS Compute vCPU in Frankfurt (~€5/Monat)
- [ ] Domain `anon.signflow.de` + DNS-Record + TLS (Caddy)
- [ ] Separates Repo `signflow-anon-proxy` bauen (Regex + GLiNER lokal + Llama-70B-Fallback)
- [ ] Azure OpenAI EU Deployment (Region Sweden Central oder Germany West Central)
- [ ] Azure AVV + Token in Vercel-Env
- [ ] `generateDummyResult()` durch echten Azure-Call ersetzen (System-Prompt steht in `src/lib/checker/prompt.ts`)

---

## 🟠 Muss vor Production (aus TODO.md)

- [ ] **Firma.dev Live-Integration** — Envelope-POST + Signed-PDF-Download + Storage-Upload (aktuell gemockt)
- [ ] **Final-PDF über alle Teilnehmer** — nicht nur ersten, per-TN-PDFs konkatenieren oder 1 PDF pro (Kurs × TN)
- [ ] **Storage-Privatisierung** — Vercel Blob (public mit Random-Suffix) → privater Bucket (R2/S3) mit signierten URLs
- [ ] **Neon DB-Passwort-Rotation** (letzter Schritt vor Prod-Cutover)
- [ ] **Data-Isolation-Audit** — systematisch prüfen, dass `coach_id = session.user.id` serverseitig überall erzwungen wird
- [ ] **Audit-Log für Impersonation** start/stop (Helper da, Actions loggen noch nicht)

---

## 🟡 Rollout-Infrastruktur (vorbereitet, nicht gebaut)

- [ ] `signing_enabled`-Flag auf `users` (Migration + Default `false`)
- [ ] Nav-Filter + Route-Guards pro User (nicht nur UI-Hide, Server-Gate)
- [ ] Admin-UI für Bildungsträger zum Per-Coach-Togglen
- [ ] Pilot-Coaches (3–4) fürs Signature-Tool auswählen

---

## 🟢 Checker-Loose-Ends (nice-to-have, keine Blocker)

- [ ] E-Mail-Send an Bildungsträger-Postfach bei BER-Submit (Resend-Integration)
- [x] Agency-Detail-View für einzelne BERs (read-only, mit Print-Option) — **erledigt 2026-04-23**
- [ ] Metadaten-Form-Felder im BER-Export-Layout (AVGS-Maßnahme, TN-Name, Zeitraum — aktuell leer-Cells, Coach füllt per Hand)
- [ ] Aufbewahrungsfrist-Automatik + Auto-Delete nach X Jahren für submitted BERs

---

## ⚪ Tech-Debt

- [ ] `agency`-Rolle umbenennen auf `bildungsträger` (Enum-Migration, Routen, Impersonation) — kein Zeitdruck
- [ ] Auto-Notify nach Coach-Sign debouncen (aktuell 1 Mail pro Sign, Batch-Signing erzeugt mehrere in Folge)
- [ ] Coach-Print-Toolbar-CSS nach `globals.css` extrahieren

---

## 📦 Phase 2 (bewusst deferred, nicht im MVP)

- [ ] **Agency-Monatsreport** (`/agency/reports`) — pro-Coach kumulierte UE, Fortschritt vs. Bewilligung
- [ ] **Rechnungswesen + Mahnwesen** — Rechnung pro abgeschlossenem Kurs (UE × variabler Stundensatz), 14-Tage-Reminder, eigenes Schema
- [ ] **Kurs-Modell-Redesign** — Kurse als Maßnahme-Templates + TN-Bibliothek (wartet auf 1:1-vs-Gruppen-Entscheidung)

---

## Empfohlene Reihenfolge

1. **DSGVO-Hardcore-Review jetzt** — Klarheit schaffen, bevor weitergebaut wird
2. AVV-Paperwork + Datenschutzerklärung parallel starten (User unterschreibt, Claude drafted Formulierungen)
3. AI-Wiring: IONOS-Account anlegen (5 Min), Proxy-Repo vorbereiten
4. `signing_enabled`-Flag bauen (1–2 h) → Signflow kann mit Checker-only online gehen
5. Alles andere Phase-2 oder kosmetisch

---

## Referenzen

- [CLAUDE.md](CLAUDE.md) — Projekt-Kontext + Architektur-Entscheidungen
- [TODO.md](TODO.md) — feingranulare Tasks (vor allem Signature-Tool)
- [docs/abschlussbericht-checker.md](docs/abschlussbericht-checker.md) — Checker-Deepdive, DSFA-Bausteine, Compliance-Paket
- [docs/checker-rules.md](docs/checker-rules.md) — Regelkatalog Bildungsträgerin Erango

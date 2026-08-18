# Rechts-Audit — Maßnahmenliste (peu à peu)

Ergebnis der Anwalts-Durchsicht vom **2026-08** (fünf Blickwinkel: Signatur/eIDAS,
DSGVO/Rechtstexte, Storage/TOM, Access-Control, AZAV/Claims). Wir arbeiten die
Punkte schrittweise ab und haken hier ab.

> **Legende Owner:** _wir_ = Code/Umsetzung · _du_ = Benny (Verträge/Entscheidung) ·
> _Anwalt_ = externe Rechtsberatung.
> **Status:** ☐ offen · ☑ erledigt · 🔄 in Arbeit.

---

## ☑ Erledigt

### Easy Wins #1–8 — Wahrheits-Korrekturen an Rechtstexten & Claims
Reine Text-/Doku-Fixes, kein Verhaltens-Code. **Auf Prod live (PR #191, 2026-08-18)**
— auf Staging + signflow.coach verifiziert.
- ☑ PDF-Audit-Trail: falsche Normzitate „§126a BGB / eIDAS Art. 26" (QES/AES) →
  zutreffende einfache eSig (Art. 3 Nr. 10 i.V.m. Art. 25 eIDAS)
- ☑ „Identitätsnachweis"-Claim raus → IP + E-Mail-Zugang (Magic-Link)
- ☑ Pauschales „rechtssicher/rechtsgültig" relativiert (Hero, Footer, How-it-works, FAQ)
- ☑ Storage „Vercel Blob" → Cloudflare R2 (privat); FAQ-Subprozessorliste ergänzt
- ☑ AVV-Claim „mit allen abgeschlossen" entschärft (Datenschutz §6, FAQ, Features)
- ☑ Veraltete Normen: TMG → DDG, TTDSG → TDDDG
- ☑ Doku-Drift Magic-Link „24 h" → „7 Tage" (CLAUDE.md)
- ☑ **PR #191 nach `main` gemergt → auf Prod live** (2026-08-18)

---

## 🔴 P0 — Beweiswert (Code-Feature, _wir_)

- ☐ **Finales PDF einfrieren + hashen.** Bei Abschluss einmal rendern → R2 ablegen,
  SHA-256 in `final_documents` persistieren. Heute: PDF wird bei jedem Abruf live
  aus der DB neu gerendert → rückwirkend/unbemerkt änderbar, kein Urzustand.
  Belege: `app/bildungstraeger/reviews/actions.ts:151`,
  `app/api/courses/[id]/participants/[participantId]/pdf/route.ts:107`.
  _(Zugleich Vorstufe zum späteren PAdES-Siegel.)_
- ☐ **Manipulationsfenster schließen.** `correctSessionTopic` ändert Thema/Modus
  nach beidseitiger Signatur, behält Unterschriften, loggt alten/neuen Text NICHT.
  Fix: (a) TN-Signatur bei Inhaltsänderung invalidieren (Re-Sign) **oder** (b)
  alt+neu vollständig ins Audit-Log + sichtbar aufs PDF (Änderung erkennbar).
  Beleg: `app/coach/courses/[id]/actions.ts:934` (+ `applyAnwSuggestion:1028`),
  `src/lib/fes-gates.ts:39`, Audit-Metadata `actions.ts:997`.

## 🟠 P1 — teils Code, teils extern

- ☐ **AGB / Nutzungsbedingungen** für das zahlungspflichtige SaaS (Haftungsbegrenzung,
  SLA, Laufzeit/Kündigung/Auto-Renewal). Aktuell nur Impressum/Datenschutz/Cookies. — _Anwalt → wir verlinken_
- ☐ **Aktive AVVs + SCCs** mit Neon/Vercel/Cloudflare/IONOS/Azure/Resend real
  abschließen + DPF-Status (Vercel/Cloudflare/MS) dokumentieren. Siehe `DATENSCHUTZ-TODO.md`. — _du_
- ☐ **AVV-Template innosee ↔ Bildungsträger** + verbindlicher Onboarding-Schritt
  (heute nur `mailto:` „AVV anfragen"). — _Anwalt + wir_
- ☐ **DSB benennen** (Art. 9-Verarbeitung im Checker → wahrscheinlich Pflicht,
  Art. 37/§ 38 BDSG) + **DSFA** (Art. 35). — _du/DSB_
- ☐ **Datenschutzerklärung aus „Entwurf" freigeben** + 2 Platzhalter füllen
  (DSB-Kontakt, Controller/Processor-Abgrenzung); Entwurf-Banner entfernen. — _DSGVO-Beratung → wir_
- ☐ **ANW-Check-Transfer offenlegen.** Termintexte gehen im Klartext an Azure OpenAI
  (US-Konzern); DSE §4 (Signatur-Modul) erwähnt das nicht. §4 ergänzen (+ ggf.
  anonymisieren). Beleg: `src/lib/checker/anw-check.ts:14`. — _wir_

## 🟡 P2 — Verifikation & kleinere Fixes

- ☑ **Prod-DB read-only geprüft (2026-08):** **0 öffentliche
  `*.public.blob.vercel-storage.com`-URLs** über alle 9 URL-/Logo-Spalten
  (2187 signatures, 323 document_signatures, 166 participants, 94 users,
  24 final_documents u.a. — alle R2-nativ/privat). Kein Handlungsbedarf.
  Geprüft via `neonctl` Rolle `backup_ro` (read-only). Beleg: `src/lib/storage.ts:224`.
- ☐ **Azure-Vertragskonto klären:** Abo läuft auf privatem MS-Konto (`info@innosee.de`)
  → greift MS-DPA/SCC? DSE nennt „Microsoft Ireland". — _du_
- ☐ **Resend-Webhook** von Query-Secret auf Svix-Signatur umstellen.
  Beleg: `app/api/webhooks/resend/route.ts:31`. — _wir, klein_
- ☐ **AZAV-Träger-Zulassungs-/Zertifikatsnummer** + Träger-Anschrift aufs Nachweis-PDF;
  erst AfA-Formularstandard bestätigen. Beleg: `src/components/stundennachweis.tsx:168`. — _du → wir_
- ☐ **Unternehmer-Checkbox** bei `/register` (schließt Verbraucherwiderruf aus). — _wir, klein_

## 🟢 P3 — später

- ☐ **Löschverfahren / Art-17-Pfad** für Kurs-/Signatur-/TN-Daten (Retention-Cron
  löscht nur Tokens+Audit; `participants` hat kein `deleted_at`). Frist braucht
  Rechtsinput. Siehe Memory `project_kundendaten_retention_task`. — _du/Anwalt → wir_
- ☐ **Rate-Limit** auf `/sign/[token]` (defense-in-depth; durch 256-Bit-Entropie
  entschärft). — _wir, optional_
- ☐ **`.env.local.prod.bak`** vom Laptop löschen/verschlüsselt ablegen (kein Repo-Leak,
  aber Klartext-Prod-Creds lokal). — _du/wir_

---

## ✅ Vom Anwalt als sauber bestätigt (kein Handlungsbedarf)

- Mandantentrennung / Access-Control: **kein IDOR**, konsequent serverseitig
  gescoped, testgesichert (`course-access.integration.test.ts`, `tenant-owner.integration.test.ts`).
- R2-Storage privat + signierte URLs + Prod-Fail-Hard-Guard.
- Impersonation: Schreib-/Signatur-Block hart verdrahtet (`assertNotImpersonating`).
- Magic-Link: 256-Bit-Entropie, nur SHA-256-Hash at rest.
- Bridge-Modus ehrlich: kein Fake-Siegel, „FES" nirgends user-sichtbar.
- Secret-Hygiene: keine Secrets im Repo / in der Git-History.

---

_Quelle: fünf parallele Prüf-Agenten (Signatur/eIDAS · DSGVO/Texte · Storage/TOM ·
Access-Control · AZAV/Claims), 2026-08. Detail-Belege in der jeweiligen Datei:Zeile oben._

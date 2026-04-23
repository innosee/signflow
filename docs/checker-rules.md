# Regelkatalog Bildungsträger (Erango)

Referenzdokument für den Abschlussbericht-Checker. Eingegangen per E-Mail am 2026-04-21 von Erango. Basis für den Azure-OpenAI-System-Prompt.

**Quelle:** Leitfaden „Dokumentationsstandards für Einzelcoachings (AVGS)" — Anwesenheitslisten (ANW) & Teilnehmerbezogene Abschlussberichte (BER).

**Anwendungskontext:** AZAV-/AMDL-Prüfung durch Bundesagentur für Arbeit, Maßnahme „erango systemisches Karrierecoaching (EKC)".

---

## 1. Anwesenheitsliste (ANW) — Formale Regeln

Die ANW ist ein Abrechnungsdokument. Fehler führen zu Kürzungen/Rückforderungen.

| Regel | Prüfung |
|---|---|
| **Taktung** | In der Regel 2 Termine/Woche. Abweichungen (Krankheit/Urlaub) kurz im BER begründen. |
| **Sonntage** | Nie Coaching an Sonntagen. |
| **Feiertage** | Nie Coaching an gesetzlichen Feiertagen (Bundesland beachten!). |
| **Samstage (Start)** | Startdatum darf **niemals** Samstag sein. |
| **Samstage (sonstige)** | Generell vermeiden; Ausnahme erlaubt, aber nicht als Regel. |
| **Zeitraum-Logik** | Termine exakt im Bewilligungszeitraum (AVGS start…end). |
| **Stunden-Logik** | UE-Summe passt zum bewilligten Kontingent. |

**Architektur-Hinweis:** ANW-Validierung ist deterministisch (Datum-Checks, keine AI nötig). Logik gehört in den Signature-Tool-Flow (Session-Creation-Validation + Course-Dashboard-Warnings), **nicht** in den Abschlussbericht-Checker. Siehe `docs/abschlussbericht-checker.md` § 1 für Scope-Trennung.

---

## 2. Abschlussbericht (BER) — Inhaltliche Regeln

### 2.1 Pflichtinhalte (Must-Have)

Der Bericht muss die Coaching-Meilensteine sinngemäß (nicht wortgetreu) abbilden:

- [ ] **Profiling / Potentialanalyse / Standortbestimmung** — Klärung der Ausgangslage
- [ ] **Zielarbeit** — Definition beruflicher Wünsche und Ziele
- [ ] **Strategie** — Bewerbungsstrategie + Handlungsperspektiven
- [ ] **Umsetzung** — aktive Unterstützung bei Unterlagen, Selbstmarketing, Selbstpräsentation
- [ ] **Marktorientierung** — Analyse des Arbeitsmarkts, Netzwerke nutzen
- [ ] **Prozessbegleitung** — kontinuierliches Feedback, gemeinsame Problembewältigung

### 2.2 No-Go-Liste (Hard-Blocks)

| Kategorie | Verbotene Begriffe / Inhalte | Alternative Formulierung |
|---|---|---|
| **Medizin / Psyche** | Depression, Burnout, Trauma, AD(H)S, Panikattacken, Erschöpfung | „Persönliche Belastungssituation", „Herausforderungen im gesundheitlichen Bereich" |
| **Diagnostik** | arbeitsunfähig, Therapie empfohlen, psychisch instabil, behandlungsbedürftig | „Der Fokus lag auf der Stabilisierung der Leistungsfähigkeit", „Klärung der Rahmenbedingungen" |
| **Juristisches** | Mobbing, Diskriminierung, sexuelle Belästigung, Schuld, rechtswidrig | „Konfliktbehaftetes Vorbeschäftigungsverhältnis", „Schwierigkeiten am vorherigen Arbeitsplatz" |
| **Pathologisierung** | narzisstisch, toxisch, manipulativ, instabil, krankhaft | – (ersatzlos streichen, ggf. verhaltensneutral umschreiben) |
| **Charakter-Bewertung** | faul, desinteressiert, emotional labil | „TN benötigt Impulse zur Eigenmotivation", „Herausforderung in der Selbstregulation" |
| **Negative Prognose** | nicht vermittelbar, ungeeignet für den Arbeitsmarkt, Coaching war erfolglos | „TN benötigt weitere Unterstützung bei …", „Integration erfordert Anpassung der Suchstrategie" |
| **Küchenpsychologie** | „schwere Kindheit", „problematischer Vater", Familien-Analyse | – (nicht Coach-Aufgabe, ersatzlos streichen) |

### 2.3 Goldene Regeln (Tonalität)

- **Wohlwollend & ressourcenorientiert:** Beschreibe nicht, was der TN nicht kann, sondern woran gearbeitet wurde und welche Potentiale aktiviert wurden.
- **Keine Diagnosen:** Coaches sind keine Ärzt:innen und arbeiten nicht therapeutisch. Wenn ein TN von seiner Depression erzählt: „Der Teilnehmer thematisierte gesundheitliche Einschränkungen, die Auswirkungen auf die aktuelle Belastbarkeit haben."
- **Konkrete Ergebnisse:** „Unterlagen wurden aktualisiert", „Drei Zielberufe wurden konkretisiert", „Strategie für verdeckten Arbeitsmarkt erstellt", „Bewerbungen an Firma X für Stelle Y gesendet — Ergebnis läuft noch / Vorstellungstermin am …"
- **Nächste Schritte:** Arbeitsvermittler braucht Handlungsanweisung. Beispiel: „Empfehlung: Aufnahme einer sozialversicherungspflichtigen Beschäftigung im Bereich X oder weitere Vertiefung der IT-Kenntnisse."

**Merksatz:** Schreib den Bericht so, dass der Teilnehmer ihn lesen kann, ohne sich angegriffen zu fühlen, und der Prüfer ihn lesen kann, ohne eine Kürzung der Mittel zu begründen.

### 2.4 Profi-Tipps (Ressourcen-Brille)

- **Ressourcen-Brille:** Statt „Teilnehmer hat eine psychische Krise" → „Die Stabilisierung der persönlichen Rahmenbedingungen war integraler Bestandteil, um die Konzentration auf den Bewerbungsprozess wiederherzustellen."
- **Kausalität im Coaching:** Der Beirat nach § 182 SGB III legt Wert darauf, dass die Maßnahme die „Vermittlungsaussichten verbessert". Der Bericht muss also zeigen, **warum** der TN jetzt näher am Arbeitsmarkt ist als vorher (optimierte Unterlagen, geschärftes Profil, …).
- **Datenschutz vs. Informationspflicht:** Keine Krankheiten melden, aber Hemmnisse schon — mit neutralen Begriffen: „persönliche Herausforderungen im lebenspraktischen Bereich" oder „gesundheitliche Einschränkungen, die bei der Stellenauswahl berücksichtigt wurden".

---

## 3. Referenz-Prompt (wie von Erango vorgeschlagen)

> Du handelst als erfahrener AZAV-Auditor und AMDL-Prüfer der Bundesagentur für Arbeit. Deine Aufgabe ist die strikte Qualitätskontrolle von Anwesenheitslisten (ANW) und teilnehmerbezogenen Abschlussberichten (BER) für AVGS-Einzelcoachings (MAT).
>
> **Prüfschritt 1: Formale Prüfung der ANW (Logik & Richtlinien)**
> - Frequenz: exakt 2 Termine/Woche? (Abweichungen als „Klärungsbedarf" markieren)
> - Ausschlusszeiten: Feiertage (Bundesland!), Sonntage, Startdatum ≠ Samstag
> - Logik: UE-Stunden passen zum bewilligten Maßnahmezeitraum? Start/End im bewilligten Zeitraum?
>
> **Prüfschritt 2: Inhaltliche Prüfung des BER**
> - A: No-Go (Diagnosen, Medizinische Einschätzung, Juristische Wertungen, Pathologisierung, Negative Prognosen, Persönliche Bewertung)
> - B: Must-Have (Profiling, Zielklärung, Strategie, Umsetzungshilfe, Bewerbungstraining, Arbeitsmarkt-Analyse)
> - C: Tonalität & Empfängerhorizont (wohlwollend, klare nächste Schritte)
>
> **Output-Format:**
> - Status ANW: (OK / Fehler gefunden)
> - Status BER: (Freigabe / Überarbeitung nötig)
> - Gefundene Verstöße: Liste kritischer Begriffe oder formaler Fehler
> - Optimierungsvorschlag: Formuliere kritische Stellen so um, dass sie AMDL-konform und „erango-Standard" sind

**Umsetzungs-Anpassung für Signflow:** Nur Prüfschritt 2 (BER) geht an Azure OpenAI. Prüfschritt 1 (ANW) läuft deterministisch im Signature-Tool-Flow — siehe oben § 1.

---

## 4. Output-Format für Signflow-UI

Gemappt aus dem Erango-Prompt, für die Results-Page:

```json
{
  "status": "pass" | "needs_revision",
  "must_haves": [
    { "topic": "profiling", "covered": true },
    { "topic": "zielarbeit", "covered": true },
    { "topic": "strategie", "covered": false, "hint": "Bewerbungsstrategie wird nicht erwähnt — bitte ergänzen." },
    ...
  ],
  "violations": [
    {
      "category": "medizin",
      "severity": "hard_block",
      "quote": "leidet unter chronischer Depression",
      "placeholder_ref": "BER_ABSATZ_1",
      "rule": "Diagnosen unzulässig",
      "suggestion": "Der Teilnehmer thematisierte gesundheitliche Einschränkungen, die Auswirkungen auf die aktuelle Belastbarkeit haben."
    },
    ...
  ],
  "tonality_feedback": "Der Bericht ist in Teilen wertend (z.B. \"Träumer\"). Empfehlung: ressourcenorientiert umformulieren."
}
```

Die `placeholder_ref` referenziert die anonymisierte Textstelle. Das Browser-Frontend mapt zurück auf den Original-Text des Coaches.

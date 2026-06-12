# Signatur-Workflow-Manifest

> **Zweck:** Arbeitsdokument. Wir spielen den Flow Screen für Screen durch; pro Schritt halten wir
> Ist-Verhalten + `🔧 ANMERKUNG` fest. Anmerkungen sind das Arbeitspaket für die Umsetzung.
>
> Status: ✅ ok / 🔧 Anmerkung offen / 🚧 in Umsetzung / ✔️ umgesetzt / 🅿️ später (geparkt)
>
> Stand: 2026-06-12 · Branch `feat/pdf-polish`

---

## Schritt 0 — Coach-Dashboard (Einstieg) · ✅

Coach loggt sich ein und landet im Signatur-Bereich. Zwei unabhängige Einstiege:
- **Unterschrift setzen** — gelber Hinweis „Unterschrift noch nicht hinterlegt" → *Jetzt anlegen*.
  Vorbedingung fürs Session-Bestätigen, blockiert aber das Kurs-Anlegen NICHT.
- **Kurs anlegen** — *+ Neuer Kurs* (Leerzustand „Meine Kurse (0)").

Bewertung: passt so.

---

## Schritt 1 — Neuer Kurs anlegen (Kopfdaten + 1..n Teilnehmer) · ✅ mit Anmerkungen

**Screen:** `/coach/courses/new` → „Neuer Kurs"

**Kopfdaten (Kursdaten):** Titel (AVGS-Maßnahme), AVGS-Nr., Durchführungs-Ort (Online/Anschrift),
Bewilligte UE, Bedarfsträger\*, Maßnahmentyp\* (Default „EKC — Karriere-Coaching"), Start-/Enddatum.

**Teilnehmer:** Zeile aus Name/Vorname · E-Mail · Kunden-Nr. (AfA), *+ Teilnehmer hinzufügen*,
mind. ein Teilnehmer. → *Kurs anlegen*.

Bewertung: Screen an sich passt.

### 🔧 ANMERKUNG 1a — Soll-/Bewilligungs-Eckdaten für ANW-Check ergänzen
Kopfdaten sollen zusätzliche **Soll-Vorgaben** bekommen, damit der spätere ANW-Check
**Ist gegen Soll** rechnen kann (vorhanden: bewilligte UE gesamt, Start/Ende).
→ Welche konkreten Felder (z.B. Max UE/Tag, Max UE/Woche, bewilligte Tage, Präsenz/Online-Anteil)
ist noch **offen** — legt der User selbst fest, nicht vorgeben.

### 🅿️ ANMERKUNG 1b — Zustände regressions-testbar machen (später)
Nicht Feature, sondern Test-Infrastruktur: gezielt prüfbar machen, ob bei Änderungen am Flow
etwas bricht bzw. der Status quo erhalten bleibt (Seed-/Dev-Helper o.ä. für definierte Zustände).
**Geparkt** als eigener Task, nicht jetzt.

### ✔️ BUG 1c — Kurs-Insert scheitert: `courses.massnahme_typ` fehlte in der DB (GEFIXT auf Dev)
**Symptom:** „Kurs konnte nicht angelegt werden (Failed query: insert into courses … )".
**Ursache:** Schema (`schema.ts:291`, enum `massnahme_typ` EKC/ESC/EGC/ESCA, Default EKC) war der
DB voraus — Spalte UND Enum-Typ existierten auf der Dev-DB `ep-crimson-mode` nicht (PR #64 push
nie hier gelaufen). Drizzle-Error zeigt nur SQL+Params, nicht die Postgres-Ursache → per
`information_schema`-Introspektion verifiziert.
**Fix (Dev, additiv, kein Datenverlust):**
```sql
CREATE TYPE "massnahme_typ" AS ENUM ('EKC','ESC','EGC','ESCA');
ALTER TABLE "courses" ADD COLUMN "massnahme_typ" "massnahme_typ" NOT NULL DEFAULT 'EKC';
```
### 🅿️ FOLGE-TASK 1d — Gleiche Drift auf Staging + Prod ziehen (vor Go-Live)
`massnahme_typ` (+ ggf. weitere PR-#64-Spalten) fehlen vermutlich auch auf Staging/Prod.
Vor Production dort denselben push/DDL anwenden. **Nicht ohne explizites Go an Prod.**
Verweist auf [[project_secret_rotation_batch]]-Logik: gebündelt kurz vor Prod.

### ✔️ UX 1e — Formular-Felder bleiben bei Fehler leer (GEFIXT)
**Symptom:** Bei einem Fehler im Kurs-Anlegen waren alle ausgefüllten Felder sofort leer.
**Ursache:** React 19 setzt ein `<form action={…}>` (useActionState) nach jedem Action-Durchlauf
automatisch zurück — auch bei reinem Fehler-State. Die Kopfdaten-Felder waren **uncontrolled**
(kein `value`-Binding) → wurden geleert. (Teilnehmer-Zeilen hingen schon an `useState` → blieben.)
**Fix (Option A):** Kopfdaten in `head`-useState gehoben, alle 8 Felder + 2 Selects controlled
(`value`/`onChange`); `name`-Attribute unverändert → Server-Contract gleich.
`app/coach/courses/new/course-form.tsx`. Typecheck grün.

---

<!-- Ab hier füllen wir Schritt für Schritt weiter, während wir durchklicken. -->

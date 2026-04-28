import type { Metadata } from "next";
import Link from "next/link";

import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";

export const metadata: Metadata = {
  title: "Anleitung — Signflow nutzen",
  description:
    "Schritt-für-Schritt: wie du als Coach Anwesenheitsnachweise digital signierst und Abschlussberichte mit dem KI-gestützten Checker schreibst.",
};

const SIGN_STEPS: Array<{ num: string; title: string; body: string }> = [
  {
    num: "01",
    title: "Einladung annehmen",
    body: 'Du erhältst vom Bildungsträger eine E-Mail mit einem Setup-Link. Klick drauf, leg ein Passwort fest und zeichne im Browser-Canvas einmalig deine Unterschrift — Finger, Maus oder Stift, das Endgerät ist egal.',
  },
  {
    num: "02",
    title: "Kurs + Teilnehmer:innen anlegen",
    body: 'Im Coach-Dashboard auf „Neuer Kurs". Trag Titel, Maßnahme, Bedarfsträger und Zeitraum ein. Teilnehmer:innen ergänzt du mit Name, E-Mail und Kunden-Nr. — die E-Mail wird später für den Magic-Link gebraucht.',
  },
  {
    num: "03",
    title: "Sessions dokumentieren",
    body: 'Pro Termin: Datum, Unterrichtseinheiten, Modus (Präsenz/online), Themen. Auch nachträglich möglich, solange der Kurs läuft. Wochenenden sind aktuell gesperrt — AfA-Coachings finden an Werktagen statt.',
  },
  {
    num: "04",
    title: "Pro Session bestätigen",
    body: 'In der Kursansicht klickst du je Session auf „Ich bestätige". Deine vorhandene Unterschrift wird mit Zeitstempel + IP-Adresse im Audit-Log festgehalten — kein erneutes Zeichnen nötig.',
  },
  {
    num: "05",
    title: "Magic-Link an TN auslösen",
    body: 'Sobald du fertig signiert hast: Button „Teilnehmer:in benachrichtigen". Pro Kurs × TN ein Link, 24 h gültig. Bei neuen Sessions später wird automatisch ein frischer Link verschickt — der alte wird ungültig.',
  },
  {
    num: "06",
    title: "TN signiert mobil",
    body: 'TN öffnet den Link am Handy, zeichnet beim ersten Mal die eigene Unterschrift, bestätigt offene Sessions per Klick. Kein Account, kein Passwort, kein Download.',
  },
  {
    num: "07",
    title: "Preview freigeben lassen",
    body: 'Wenn alle Sessions von allen TN signiert sind, schickst du einen Preview-Link. TN sieht das vollständige Dokument — pixelgleich zum späteren PDF — und klickt „Freigeben" (Audit-Log, keine FES).',
  },
  {
    num: "08",
    title: "FES + AfA-Übermittlung",
    body: 'Nach TN-Freigabe klickst du „Mit FES versiegeln". Das System rendert das HTML als A4-PDF, holt eine fortgeschrittene elektronische Signatur (eIDAS) über Firma.dev und übergibt das Dokument zur Übermittlung an die Agentur für Arbeit.',
  },
];

const CHECKER_STEPS: Array<{ num: string; title: string; body: string }> = [
  {
    num: "01",
    title: "Bericht aufrufen",
    body: 'Im Coach-Dashboard auf „Berichts-Checker". Du siehst alle Teilnehmer:innen mit Status (offen / Entwurf / eingereicht). Klick auf eine Zeile öffnet den BER-Editor; der „Schnell-Check" ist für schnelle Prüfungen ohne Persistenz.',
  },
  {
    num: "02",
    title: "Drei Felder ausfüllen",
    body: 'Teilnahme & Mitarbeit · Ablauf & Inhalte · Fazit & Empfehlungen. Schreib in normalem Fließtext — kein Layout-Stress, das Format ist standardisiert. Live-Sidebar zeigt rechts, welche Pflichtbausteine schon abgedeckt sind.',
  },
  {
    num: "03",
    title: "Autosave läuft mit",
    body: 'Alles wird sekündlich in deinem Browser gespeichert — Refresh oder versehentlicher Tab-Schluss sind unkritisch. Erst beim „Final prüfen" geht der Text auf den Server.',
  },
  {
    num: "04",
    title: "Final prüfen klicken",
    body: 'Drei Stufen: (1) Anonymisierung in Frankfurt — Namen/Adressen/Daten werden durch Platzhalter ersetzt, (2) Regel-Validierung gegen den AMDL-Katalog (Azure EU), (3) Reverse-Mapping im Browser — du siehst Originale, der Server nie.',
  },
  {
    num: "05",
    title: "Verstöße in der Sidebar abarbeiten",
    body: 'Rechts erscheint pro Verstoß eine Karte mit Zitat + Umformulierungs-Vorschlag. Du arbeitest dich von oben durch: „Im Text übernehmen" tauscht die Stelle direkt im Editor links aus, „Im Text markieren" springt zur Stelle und legt den Vorschlag in die Zwischenablage. Wenn du etwas manuell anders gelöst hast, einfach abhaken.',
  },
  {
    num: "06",
    title: "Erneut prüfen",
    body: 'Wenn alle Karten abgehakt oder übernommen sind, oben rechts „Erneut prüfen". Stellen, die das Modell trotz übernommener Verbesserung nochmal anmäkelt, bekommen einen grauen Badge „schon übernommen" — meist ignorierbar (LLM-Rauschen, kein echter Verstoß).',
  },
  {
    num: "07",
    title: "Verbindung testen bei Problemen",
    body: 'Wenn die Anonymisierung scheitert: oben auf der Checker-Übersicht den gelben Banner „Verbindung prüfen" klicken. Drei automatische Probes (Server, IONOS-Proxy in Frankfurt, End-to-End-Roundtrip) sagen Dir in 5 Sekunden, ob es bei Dir, beim Netzwerk oder beim Anbieter klemmt.',
  },
  {
    num: "08",
    title: "PDF exportieren",
    body: 'Bei Status „pass" oder wenn nur Soft-Hinweise übrig sind: „Als erango-PDF exportieren" — fertig zum Weiterleiten an den Bildungsträger. Edits bleiben nachträglich möglich, der nächste Export überschreibt einfach.',
  },
];

const TIPS: Array<{ title: string; body: string }> = [
  {
    title: "Daten verlassen nie Deutschland",
    body: 'Klartext geht nur zur Anonymisierungs-VM in Frankfurt. Ab dort sieht Vercel/USA und das Azure-Modell ausschließlich pseudonymisierten Text. Browser merkt sich die Mapping-Tabelle lokal und ersetzt Platzhalter beim Anzeigen wieder durch Originale.',
  },
  {
    title: "Kurze Texte = bessere Treffer",
    body: 'Pro Sektion 4–8 Sätze reichen für saubere Ergebnisse. Sehr lange Texte verwässern die Regelprüfung — die KI fokussiert dann auf Stilfragen statt auf inhaltliche Pflichtbausteine.',
  },
  {
    title: "Stückweise abarbeiten statt Endlosschleife",
    body: 'Erstprüfung läuft, dann arbeitest du die Verstöße einzeln in der Sidebar ab — pro Stelle „Im Text übernehmen" oder manuell anpassen, Checkbox abhaken wenn fertig. Erst wenn alles erledigt ist: einmal Re-Check zur finalen Bestätigung. Mehr als 2–3 Durchgänge brauchen die wenigsten Berichte.',
  },
  {
    title: "Browser auf aktuellem Stand",
    body: 'Edge / Chrome / Firefox in den letzten zwei Major-Versionen funktionieren stabil. IE-Modus, Internet Explorer 11 und sehr alte Safari-Versionen sind nicht unterstützt — Canvas-Signatur und CORS-Verhalten weichen dort ab.',
  },
];

export default function AnleitungPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900">
      <LandingNav />
      <main className="flex-1">
        <AnleitungHero />
        <ModuleNav />
        <SigningSection />
        <CheckerSection />
        <TipsSection />
        <SupportCta />
      </main>
      <LandingFooter />
    </div>
  );
}

function AnleitungHero() {
  return (
    <section className="border-b border-zinc-200 bg-linear-to-b from-zinc-50 to-white">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Anleitung für Coaches
        </span>
        <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-zinc-950 sm:text-5xl">
          So nutzt du Signflow.{" "}
          <span className="text-zinc-500">Schritt für Schritt.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
          Zwei Module, ein Login: digital signierte Anwesenheitsnachweise an die
          Agentur für Arbeit, und KI-gestützte Prüfung deiner Abschlussberichte
          gegen den AMDL-Regelkatalog. Auf dieser Seite findest du die Bedienung
          beider Module — Coaches kommen erfahrungsgemäß in 15 Minuten klar.
        </p>
      </div>
    </section>
  );
}

function ModuleNav() {
  return (
    <section className="border-b border-zinc-200 bg-white">
      <div className="mx-auto grid max-w-5xl gap-4 px-6 py-10 sm:grid-cols-2">
        <a
          href="#signaturen"
          className="group rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-400"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-600">
              Modul A
            </span>
            <span className="text-zinc-400 group-hover:text-zinc-600">→</span>
          </div>
          <h2 className="mt-3 text-lg font-semibold text-zinc-950">
            Anwesenheitsnachweise
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            Kurs anlegen, Sessions dokumentieren, Coach + TN unterschreiben,
            FES-versiegeltes A4-PDF an die AfA.
          </p>
        </a>
        <a
          href="#checker"
          className="group rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-400"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-600">
              Modul B
            </span>
            <span className="text-zinc-400 group-hover:text-zinc-600">→</span>
          </div>
          <h2 className="mt-3 text-lg font-semibold text-zinc-950">
            Berichts-Checker
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            BER direkt in Signflow schreiben, anonymisieren, gegen AMDL-Regeln
            prüfen, Umformulierungen in einem Klick übernehmen.
          </p>
        </a>
      </div>
    </section>
  );
}

function SigningSection() {
  return (
    <section
      id="signaturen"
      className="scroll-mt-20 border-b border-zinc-200 bg-white"
    >
      <div className="mx-auto max-w-5xl px-6 py-16">
        <SectionHeader
          eyebrow="Modul A"
          title="Anwesenheitsnachweise mit FES"
          intro="Vom Kurs-Setup über die Coach- und Teilnehmer:innen-Signatur bis zum versiegelten PDF an die Agentur für Arbeit. Acht Schritte, einmal verstanden, danach Routine."
        />
        <StepList steps={SIGN_STEPS} />
      </div>
    </section>
  );
}

function CheckerSection() {
  return (
    <section
      id="checker"
      className="scroll-mt-20 border-b border-zinc-200 bg-zinc-50"
    >
      <div className="mx-auto max-w-5xl px-6 py-16">
        <SectionHeader
          eyebrow="Modul B"
          title="Abschlussbericht-Checker"
          intro="Der Checker liest deine BER, anonymisiert sie in Frankfurt, prüft sie gegen den erango-/AMDL-Regelkatalog und schlägt konkrete Umformulierungen vor — automatisch übernehmbar."
        />
        <Link
          href="/anleitung/schnellcheck"
          className="group mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50/60 px-5 py-4 transition hover:border-emerald-500"
        >
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700">
              Mini-Anleitung · DE / UK
            </span>
            <p className="mt-1 text-sm font-medium text-zinc-900">
              Schnellcheck Schritt für Schritt — vom Coach-Klick bis zum PDF
              beim Bildungsträger.
            </p>
          </div>
          <span className="shrink-0 text-sm text-emerald-800 group-hover:text-emerald-950">
            Anleitung öffnen →
          </span>
        </Link>
        <StepList steps={CHECKER_STEPS} />

        <div className="mt-10 rounded-xl border border-zinc-300 bg-white p-6">
          <h3 className="text-sm font-semibold text-zinc-950">
            Wie der Checker prüft
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Drei Stufen, alle in der EU:
          </p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            <PipelineStep
              num="1"
              label="Anonymisierung"
              place="IONOS Frankfurt"
              desc="Browser → Proxy direkt, Vercel/USA sieht keinen Klartext."
            />
            <PipelineStep
              num="2"
              label="Regel-Validierung"
              place="Azure OpenAI EU"
              desc="Pseudonymisierter Text wird gegen den AMDL-Katalog geprüft."
            />
            <PipelineStep
              num="3"
              label="Rück-Mapping"
              place="Dein Browser"
              desc="Platzhalter werden lokal wieder durch Originale ersetzt."
            />
          </ol>
        </div>
      </div>
    </section>
  );
}

function TipsSection() {
  return (
    <section className="border-b border-zinc-200 bg-white">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <SectionHeader
          eyebrow="Praxis"
          title="Tipps aus dem Pilot-Betrieb"
          intro="Drei bis vier Sachen, die wir aus den ersten Coaching-Wochen gelernt haben — sparen Dir Zeit und Nerven."
        />
        <ul className="grid gap-5 md:grid-cols-2">
          {TIPS.map((t) => (
            <li
              key={t.title}
              className="rounded-xl border border-zinc-200 bg-white p-6"
            >
              <h3 className="text-base font-semibold text-zinc-950">
                {t.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                {t.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SupportCta() {
  return (
    <section className="bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-14 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Hängt was, oder unklar formuliert?
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
            Direkter Draht zum Team. Bug-Reports, Wünsche, Onboarding für neue
            Coaches — alles über die gleiche Adresse, meist Antwort am gleichen
            Werktag.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="mailto:info@innosee.de"
            className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100"
          >
            info@innosee.de
          </a>
          <Link
            href="/login"
            className="rounded-lg border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-100 hover:border-zinc-500 hover:text-white"
          >
            Zum Login →
          </Link>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <div className="mb-10 max-w-3xl">
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
        {title}
      </h2>
      <p className="mt-3 text-base leading-relaxed text-zinc-600">{intro}</p>
    </div>
  );
}

function StepList({
  steps,
}: {
  steps: Array<{ num: string; title: string; body: string }>;
}) {
  return (
    <ol className="space-y-4">
      {steps.map((s) => (
        <li
          key={s.num}
          className="rounded-xl border border-zinc-200 bg-white p-5 sm:flex sm:gap-5 sm:p-6"
        >
          <div className="shrink-0 sm:w-16">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
              {s.num}
            </span>
          </div>
          <div className="mt-3 min-w-0 sm:mt-0">
            <h3 className="text-base font-semibold text-zinc-950">{s.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-zinc-600">
              {s.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function PipelineStep({
  num,
  label,
  place,
  desc,
}: {
  num: string;
  label: string;
  place: string;
  desc: string;
}) {
  return (
    <li className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-[11px] font-semibold text-white">
          {num}
        </span>
        <div className="text-sm font-semibold text-zinc-950">{label}</div>
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
        {place}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-600">{desc}</p>
    </li>
  );
}

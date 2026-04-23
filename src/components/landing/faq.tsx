"use client";

import { useState } from "react";

type Q = { q: string; a: string };

const COACH_FAQ: Q[] = [
  {
    q: "Muss ich mir einen Account anlegen?",
    a: "Nein — dein Arbeitgeber (der Bildungsträger) lädt dich per E-Mail ein. Du klickst den Link, setzt dein Passwort und legst einmalig deine Unterschrift im Browser-Canvas an. Danach brauchst du sie pro Session nur noch mit einem Klick zu bestätigen.",
  },
  {
    q: "Brauche ich ein Tablet oder einen Stift?",
    a: "Nein. Die Canvas-Unterschrift funktioniert im Browser auf Laptop, Tablet oder Smartphone — mit Finger, Maus oder Stift. Teilnehmer:innen unterschreiben am eigenen Handy, wenn sie den Magic-Link öffnen.",
  },
  {
    q: "Wie bestätigen meine Teilnehmer:innen?",
    a: "Nach jeder Coach-Signatur wird automatisch ein kurs-scoped Magic-Link an die Teilnehmer:in verschickt (24 h gültig). Beim ersten Öffnen legt sie einmalig ihre Unterschrift an; alle danach anstehenden Sessions werden per Klick-Bestätigung quittiert. Kein Account, kein Passwort.",
  },
  {
    q: "Kann ich Sessions nachträglich hinzufügen?",
    a: 'Ja. Solange der Kurs läuft, kannst du Sessions anlegen — inkl. Erstgespräch mit „geeignet JA/NEIN". Wochenenden (Sa/So) sind aktuell gesperrt, weil AfA-Coachings an Werktagen stattfinden müssen. Neue Sessions tauchen beim nächsten Magic-Link-Öffnen automatisch in der TN-Liste auf.',
  },
  {
    q: "Was passiert mit meinen Daten?",
    a: "Alle Daten liegen in der EU (Frankfurt-Region): Neon Postgres für die Kurs-/Session-Daten, Vercel Blob für die Unterschriftsbilder, Resend für den E-Mail-Versand. Pro Signatur wird IP-Adresse + Zeitstempel + Signer-Rolle (Coach/TN) im Audit-Log festgehalten — DSGVO-konform und rechtssicher.",
  },
  {
    q: "Kann ich einen Kurs nach Abschluss korrigieren?",
    a: "Vor der FES-Versiegelung: ja, alle Felder editierbar. Nach der Versiegelung ist das PDF unveränderlich (das ist Sinn der elektronischen Signatur). Bei echten Fehlern kannst du einen Korrektur-Nachtrag mit neuer FES erzeugen.",
  },
];

const AGENCY_FAQ: Q[] = [
  {
    q: "Ist die elektronische Signatur rechtsgültig für die AfA?",
    a: "Ja. Wir nutzen die fortgeschrittene elektronische Signatur (FES) nach eIDAS (EU-Verordnung 910/2014) über Firma.dev. Die AfA akzeptiert FES für Stundennachweise — eine qualifizierte Signatur (QES) ist nicht erforderlich und würde deutlich höhere Kosten verursachen.",
  },
  {
    q: "Wo werden die Daten gespeichert?",
    a: "Ausschließlich in der EU (Frankfurt-Region): Neon für die Postgres-Datenbank, Vercel für App-Hosting + Blob-Storage, Resend für transaktionale E-Mails. Auftragsverarbeitungsverträge (AVV / DPA) sind mit allen Unterauftragsverarbeitern abgeschlossen und werden euch auf Anfrage bereitgestellt.",
  },
  {
    q: "Wie übernimmt Signflow die Daten-Isolation zwischen Coaches?",
    a: "Jeder Coach sieht nur seine eigenen Kurse — Data-Isolation auf DB-Query-Ebene via `coach_id`-Filter, nicht nur UI-seitig. Bildungsträger-Admins können über Impersonation in die Coach-Sicht wechseln, schreibende Aktionen (Signaturen!) sind während Impersonation hart gesperrt, damit Beweiskraft der Unterschrift nicht kippt.",
  },
  {
    q: "Wie laufen Onboarding und Rollout?",
    a: "Bildungsträger-Admin registriert sich, wird via E-Mail verifiziert, und legt im Dashboard beliebig viele Coaches + Bedarfsträger (Jobcenter/Arbeitsagentur) an. Coaches bekommen einen Invite-Link, richten Passwort + Unterschrift ein — Time-to-First-Nachweis typisch unter 15 Minuten.",
  },
  {
    q: "Was kostet es und wie wird abgerechnet?",
    a: "Monatliche Pauschale nach Coach-Anzahl: 99 € bis 10 Coaches, 199 € bis 100, 399 € bis 200. Größere Volumina individuell. Monatlich kündbar, 14 Tage kostenlos testen. Abrechnung via Stripe mit automatischem Rechnungsversand.",
  },
  {
    q: "Gibt es eine API oder Zapier-Integration?",
    a: "In Phase 2 planen wir eine JSON-API für den Import bestehender Kurs-Daten und den Export der finalen PDFs + Audit-Logs in euer CRM/Bestandssystem. Bis dahin: manueller Upload bei der AfA + PDF-Download pro Teilnehmer:in.",
  },
  {
    q: "Was, wenn ein Coach ausscheidet?",
    a: "Bildungsträger-Admin kann den Coach deaktivieren (Soft-Delete). Session + Unterschriftenhistorie bleiben für die Audit-Anforderung erhalten, der Coach verliert sofort Zugriff. Eine erneute Einladung derselben E-Mail ist später problemlos möglich.",
  },
];

export function LandingFaq() {
  const [tab, setTab] = useState<"coach" | "bildungstraeger">("bildungstraeger");
  const list = tab === "coach" ? COACH_FAQ : AGENCY_FAQ;

  return (
    <section id="faq" className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            FAQ
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Häufige Fragen.
          </h2>
        </div>

        <div
          role="tablist"
          aria-label="FAQ-Zielgruppe"
          className="mb-6 inline-flex rounded-lg border border-zinc-300 bg-white p-1"
        >
          <TabButton
            active={tab === "bildungstraeger"}
            onClick={() => setTab("bildungstraeger")}
            id="faq-tab-bildungstraeger"
          >
            Für Entscheider:innen
          </TabButton>
          <TabButton
            active={tab === "coach"}
            onClick={() => setTab("coach")}
            id="faq-tab-coach"
          >
            Für Coaches
          </TabButton>
        </div>

        <dl className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {list.map((item, i) => (
            <FaqItem key={`${tab}-${i}`} q={item.q} a={item.a} />
          ))}
        </dl>
      </div>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  id,
  children,
}: {
  active: boolean;
  onClick: () => void;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      role="tab"
      aria-selected={active}
      type="button"
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-black text-white"
          : "text-zinc-700 hover:text-zinc-950"
      }`}
    >
      {children}
    </button>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <dt>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        >
          <span className="text-sm font-medium text-zinc-950 sm:text-base">
            {q}
          </span>
          <svg
            className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </dt>
      {open && (
        <dd className="px-5 pb-5 text-sm leading-relaxed text-zinc-600">
          {a}
        </dd>
      )}
    </div>
  );
}

import type { SVGProps } from "react";

const FEATURES = [
  {
    icon: DocumentIcon,
    title: "HTML-as-Source-of-Truth",
    desc: "Was du im Browser unterschreibst, ist exakt das A4-PDF, das bei der AfA landet. Keine Design-Drift zwischen App und Dokument.",
  },
  {
    icon: PenIcon,
    title: "Canvas-Signatur einmalig",
    desc: "Coach und Teilnehmer:in erstellen ihre Unterschrift einmal — jede Session braucht nur noch eine aktive Bestätigung mit Zeitstempel.",
  },
  {
    icon: MailIcon,
    title: "Magic-Link für Teilnehmer:innen",
    desc: "Kein Account, keine Passwort-Registrierung. 24 h gültig, Kurs-scoped, bei jedem Coach-Sign wird ein frischer Link verschickt.",
  },
  {
    icon: ShieldIcon,
    title: "Fortgeschrittene Signatur (FES)",
    desc: "Finales PDF bekommt 1× FES nach eIDAS über Firma.dev — ausreichend für die AfA, ohne Kosten einer QES.",
  },
  {
    icon: ClockIcon,
    title: "Vollständiges Audit-Log",
    desc: "Pro Signatur: IP-Adresse, Zeitstempel, Rolle (Coach oder TN), Session-Kontext. Nachvollziehbar, exportierbar.",
  },
  {
    icon: GlobeIcon,
    title: "EU-Hosting + DSGVO",
    desc: "Neon Postgres + Vercel Blob + Resend — alles in Frankfurt-Region. Auftragsverarbeitungsverträge vorhanden.",
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Features
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Gebaut für den AfA-Alltag, nicht als Signatur-Generalist.
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="rounded-xl border border-zinc-200 bg-white p-6"
            >
              <f.icon className="h-6 w-6 text-emerald-600" />
              <h3 className="mt-4 text-base font-semibold text-zinc-950">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                {f.desc}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// Minimalistische Inline-Icons — keine Icon-Library-Abhängigkeit.
function DocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M7 3h7l5 5v13H7V3zM14 3v5h5M9 13h6M9 17h6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function PenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M4 20l4-1 10-10-3-3L5 16l-1 4zM13 6l3 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M4 7l8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6l8-3zM9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M3.5 12h17M12 3.5c2.5 3 2.5 14 0 17M12 3.5c-2.5 3-2.5 14 0 17"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

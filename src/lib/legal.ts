// Zentrale Quelle für alle Firmen-/Rechtsangaben, die in Impressum,
// Datenschutzerklärung und Footer verwendet werden. EINE Wahrheit → keine Drift
// zwischen den Rechtsseiten (z.B. USt-ID, die vorher in einer Seite gefüllt und
// in einer anderen Platzhalter war).
//
// 👉 Öffentliche Rechtstexte: KEINE internen Notizen/Platzhalter auf die Seiten
// (2026-09: öffentlich sichtbare „Entwurf"-Notizen haben eine
// Teilnehmer-Beschwerde ausgelöst). Offenes gehört in
// docs/rechts-audit-massnahmen.md. Memory: project_dsgvo_beschwerde_2026_09.

export const legal = {
  productName: "Signflow",
  domain: "signflow.coach",
  // Stand der zuletzt inhaltlich geänderten Rechtstexte.
  lastUpdated: "12. September 2026",

  // Externe:r Datenschutzbeauftragte:r. null = noch nicht benannt → die
  // Datenschutzerklärung zeigt dann den allgemeinen Datenschutz-Kontakt.
  // Nach der Benennung hier eintragen (+ Meldung an den LfDI BW).
  dataProtectionOfficer: null as {
    name: string;
    address: string;
    email: string;
  } | null,

  company: {
    name: "innosee GmbH",
    legalForm: "GmbH",
    street: "Bahnhofstraße 1",
    zipCity: "78351 Bodman-Ludwigshafen",
    country: "Deutschland",
    // Geschäftsführung (vertretungsberechtigt).
    represented: "Benjamin Dennis Konopka",
    email: "info@innosee.de",
    // Rechtlich optional (E-Mail genügt für § 5 DDG) — bewusst leer.
    phone: "",
    vatId: "DE400092577",
    register: {
      court: "Amtsgericht Freiburg im Breisgau",
      number: "HRB 731688",
    },
  },

  // Zuständige Datenschutz-Aufsichtsbehörde (Sitz des Verantwortlichen, BW).
  supervisoryAuthority: {
    name: "Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg",
    street: "Lautenschlagerstraße 20",
    zipCity: "70173 Stuttgart",
    url: "https://www.baden-wuerttemberg.datenschutz.de",
  },

  // Subprozessoren (Art. 28 DSGVO) — Quelle für die Empfänger-Tabelle in der
  // Datenschutzerklärung (§6) und den AVV-Anhang. NICHT die Mini-Analytics-
  // Liste — das sind Signflows echte Dienstleister.
  subprocessors: [
    {
      name: "Vercel Inc.",
      // Vercel Blob wird nicht mehr genutzt (Prod seit 2026-07 vollständig R2).
      purpose: "Hosting der Anwendung",
      region: "EU (Frankfurt), Unternehmenssitz USA — DPF-zertifiziert, zusätzlich SCCs",
    },
    {
      name: "Databricks, Inc. (Neon)",
      purpose: "Datenbank (Kurse, Sitzungen, Audit-Log)",
      region: "EU (AWS Frankfurt), Unternehmenssitz USA — DPF-zertifiziert, zusätzlich SCCs",
    },
    {
      name: "Cloudflare, Inc.",
      purpose:
        "Objekt-Storage (R2) für Unterschriftsbilder, Logos und finale PDF-Nachweise; privater Bucket, Zugriff nur über kurzlebige signierte URLs. Zusätzlich Bot-Schutz (Turnstile) auf Registrierungs- und Wartelisten-Formularen",
      region:
        "EU-Jurisdiction (Frankfurt/Amsterdam), Unternehmenssitz USA — DPF-zertifiziert, zusätzlich SCCs",
    },
    {
      name: "Resend (Plus Five Five, Inc.)",
      purpose: "Versand transaktionaler E-Mails (Magic Links, Einladungen)",
      region: "EU, Unternehmenssitz USA — DPF-zertifiziert, zusätzlich SCCs",
    },
    {
      name: "Sieben Communications GmbH (seven.io / sms77)",
      purpose:
        "Versand von Magic-Link-SMS an Teilnehmer:innen, sofern für diesen Zustellweg eine Mobilnummer hinterlegt und der Channel vom Coach gewählt wurde. Auftragsverarbeitungsvertrag nach Art. 28 DSGVO geschlossen; Verarbeitung ausschließlich in einem ISO 27001 zertifizierten Rechenzentrum in Deutschland",
      region: "Deutschland (Köln)",
    },
    {
      name: "IONOS SE",
      purpose:
        "Compute-VM und AI Model Hub für die Pseudonymisierung von Abschlussberichten vor der KI-Prüfung (nur Checker); außerdem Speicherort der verschlüsselten Datensicherungen",
      region: "Deutschland",
    },
    {
      name: "Microsoft Ireland Operations Ltd. (Azure OpenAI)",
      purpose:
        "Regelprüfung auf pseudonymisiertem Text (Abschlussbericht-Checker), KI-gestützte Compliance-Prüfung der stichwortartigen Coach-Einträge in der Anwesenheitsliste (ANW-Check) sowie Beantwortung von Support-Anfragen im Coach-Bereich (Chat-Eingaben; bitte dort keine Klarnamen oder Kunden-Nummern eingeben)",
      region: "EU (Sweden Central oder Germany West Central), Konzernsitz USA — DPF-zertifiziert, zusätzlich SCCs",
    },
  ],
} as const;

export type Subprocessor = (typeof legal.subprocessors)[number];

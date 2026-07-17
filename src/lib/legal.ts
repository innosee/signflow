// Zentrale Quelle für alle Firmen-/Rechtsangaben, die in Impressum,
// Datenschutzerklärung und Footer verwendet werden. EINE Wahrheit → keine Drift
// zwischen den Rechtsseiten (z.B. USt-ID, die vorher in einer Seite gefüllt und
// in einer anderen Platzhalter war).
//
// 👉 Rechtlicher Hinweis: Die Rechtstexte, die diese Daten verwenden, sind
// VORLAGEN und ersetzen keine Rechtsberatung. Offene Punkte (Datenschutz-
// beauftragte:r, Joint-Controllership-Abgrenzung pro Bildungsträger, AVV-
// Vertragstemplate, Art.-9-Spezifika des Checkers) sind in den Seiten gelb
// markiert und müssen vor Echtbetrieb mit Teilnehmerdaten durch eine DSGVO-
// Beratung abgenommen werden. Memory: project_datenschutzerklaerung,
// project_legal_entity.

export const legal = {
  productName: "Signflow",
  domain: "signflow.coach",
  // Stand der zuletzt inhaltlich geprüften Rechtstexte (Entwurf).
  lastUpdated: "16. Juli 2026",

  company: {
    name: "innosee GmbH",
    legalForm: "GmbH",
    street: "Bahnhofstraße 1",
    zipCity: "78351 Bodman-Ludwigshafen",
    country: "Deutschland",
    // Geschäftsführung (vertretungsberechtigt).
    represented: "Benjamin Dennis Konopka",
    email: "info@innosee.de",
    // Rechtlich optional (E-Mail genügt für § 5 TMG) — bewusst leer.
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
      purpose:
        "Hosting der Anwendung; außerdem Objekt-Storage für Bestands-Dateien aus der früheren Speicherlösung (Vercel Blob), die schrittweise in den privaten Objektspeicher überführt werden",
      region: "EU (Frankfurt), Unternehmenssitz USA — SCCs",
    },
    {
      name: "Neon Inc.",
      purpose: "Datenbank (Kurse, Sitzungen, Audit-Log)",
      region: "EU (AWS Frankfurt), Unternehmenssitz USA — SCCs",
    },
    {
      name: "Cloudflare, Inc.",
      purpose:
        "Objekt-Storage (R2) für Unterschriftsbilder, Logos und finale PDF-Nachweise; privater Bucket, Zugriff nur über kurzlebige signierte URLs. Zusätzlich Bot-Schutz (Turnstile) auf Registrierungs- und Wartelisten-Formularen",
      region:
        "EU-Jurisdiction (Frankfurt/Amsterdam), Unternehmenssitz USA — SCCs",
    },
    {
      name: "Resend Inc.",
      purpose: "Versand transaktionaler E-Mails (Magic Links, Einladungen)",
      region: "EU, Unternehmenssitz USA — SCCs",
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
        "Compute-VM und AI Model Hub für die Anonymisierung (nur Checker)",
      region: "Deutschland",
    },
    {
      name: "Microsoft Ireland Operations Ltd. (Azure OpenAI)",
      purpose:
        "Regelprüfung auf anonymisiertem Text (Abschlussbericht-Checker), KI-gestützte Compliance-Prüfung der stichwortartigen Coach-Einträge in der Anwesenheitsliste (ANW-Check) sowie Beantwortung von Support-Anfragen im Coach-Bereich (Chat-Eingaben; bitte dort keine Klarnamen oder Kunden-Nummern eingeben)",
      region: "EU (Sweden Central oder Germany West Central) — SCCs",
    },
  ],
} as const;

export type Subprocessor = (typeof legal.subprocessors)[number];

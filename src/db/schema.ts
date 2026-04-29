import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Rollen: `bildungstraeger` = oberste Ebene (Firma, die Coaches beschäftigt
 * und an die AfA übermittelt), `coach` = Einzel-Coach im Kurs. Enum-Wert
 * wurde 2026-04-23 von `agency` umbenannt, siehe Migration
 * `apply-bildungstraeger-rename-migration.mjs`.
 */
export const userRole = pgEnum("user_role", ["bildungstraeger", "coach"]);
export const courseStatus = pgEnum("course_status", [
  "active",
  "completed",
  "archived",
]);
export const sessionStatus = pgEnum("session_status", [
  "pending",
  "coach_signed",
  "completed",
]);
export const signerType = pgEnum("signer_type", ["coach", "participant"]);
export const fesStatus = pgEnum("fes_status", ["pending", "sent", "completed"]);
/**
 * Status der AfA-Übermittlung. Unabhängig vom FES-Status, weil die
 * Übermittlung (durch die Firma) zeitlich nach dem Siegel (durch den
 * Coach) passiert und separat geloggt werden muss.
 */
export const afaSubmissionStatus = pgEnum("afa_submission_status", [
  "pending",
  "submitted",
]);
/** Wer hat eine Aktion ausgelöst? Participants haben keinen `users`-Row. */
export const auditActorType = pgEnum("audit_actor_type", [
  "bildungstraeger",
  "coach",
  "participant",
  "system",
]);
/** AfA-Bedarfsträger-Typ: Jobcenter (JC) oder Arbeitsagentur (AA). */
export const bedarfstraegerType = pgEnum("bedarfstraeger_type", ["JC", "AA"]);
/** Durchführungsmodus einer Kurseinheit. */
export const sessionModus = pgEnum("session_modus", ["praesenz", "online"]);
/**
 * Lebenszyklus eines Abschlussberichts.
 * `draft` = Coach arbeitet noch dran (Autosave); `submitted` = Coach hat an die Bildungsträgerin
 * abgegeben. Edit nach Submit bleibt erlaubt (Korrekturen); Status ändert sich dadurch nicht,
 * nur `updated_at` läuft hoch.
 */
export const berStatus = pgEnum("ber_status", ["draft", "submitted"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    name: text("name").notNull(),
    image: text("image"),
    role: userRole("role").notNull().default("coach"),
    signatureUrl: text("signature_url"),
    /**
     * Branding für PDF-Header (Logo + Postadresse). In Single-Tenant
     * (aktueller Stand) nur auf der `bildungstraeger`-User-Zeile gesetzt;
     * Coaches lesen die Werte vom Bildungsträger ihres Mandanten beim
     * BER-Export. Wandert mit dem Multi-Tenant-Schema-Change auf die
     * spätere Org-Tabelle (siehe Memory `project_multitenant_commitment.md`).
     */
    pdfLogoUrl: text("pdf_logo_url"),
    pdfAddress: text("pdf_address"),
    /**
     * Feature-Flag für den Signatur-Flow (Kurse/Sessions/FES/AfA).
     * Default `false` — ausgerollt nur für Pilot-Coaches (3–4 zum Start).
     * Der Checker ist davon unabhängig und für alle sichtbar.
     * Wird vom Bildungsträger per Admin-UI pro Coach gesetzt.
     */
    signingEnabled: boolean("signing_enabled").notNull().default(false),
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // Partial unique — ein deaktivierter Coach kann neu eingeladen werden,
    // weil der Soft-Delete die alte Zeile aus dem Unique raus-nimmt.
    uniqueIndex("users_email_active_uq")
      .on(t.email)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const authSession = pgTable(
  "auth_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: uuid("impersonated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("auth_session_token_uq").on(t.token)],
);

export const authAccount = pgTable(
  "auth_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("auth_account_user_id_idx").on(t.userId),
    uniqueIndex("auth_account_provider_account_uq").on(
      t.providerId,
      t.accountId,
    ),
  ],
);

export const authVerification = pgTable("auth_verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Bedarfsträger = finanzierende Stelle pro Kurs (Jobcenter X, Arbeitsagentur Y).
 * Pflicht: Name + Typ. Adresse/Ansprechperson/E-Mail optional — relevant sobald
 * das Rechnungsmodul gebaut wird (siehe CLAUDE.md → Deferred Features).
 */
export const bedarfstraeger = pgTable("bedarfstraeger", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: bedarfstraegerType("type").notNull(),
  adresse: text("adresse"),
  kontaktPerson: text("kontakt_person"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  coachId: uuid("coach_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  /** AVGS-Maßnahmen-Nummer (von der AfA vergeben). */
  avgsNummer: text("avgs_nummer").notNull(),
  /** Durchführungs-Ort (z.B. "Online" oder "Singen, Erzbergerstr. 10"). */
  durchfuehrungsort: text("durchfuehrungsort").notNull(),
  /** Bewilligte Unterrichtseinheiten gesamt (ganzzahlig, z.B. 80). */
  anzahlBewilligteUe: integer("anzahl_bewilligte_ue").notNull(),
  bedarfstraegerId: uuid("bedarfstraeger_id")
    .notNull()
    .references(() => bedarfstraeger.id, { onDelete: "restrict" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: courseStatus("status").notNull().default("active"),
  /**
   * Ergänzende Angaben / Begründungen für den AfA-Footer. Werden auf jedem
   * Blatt des finalen PDFs ausgegeben. Checkboxen + Freitext.
   */
  flagUnter2Termine: boolean("flag_unter_2_termine").notNull().default(false),
  flagVorzeitigesEnde: boolean("flag_vorzeitiges_ende")
    .notNull()
    .default(false),
  begruendungText: text("begruendung_text"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const participants = pgTable("participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  /**
   * AfA-Kunden-Nummer des Teilnehmers (z.B. "160B29588") — Pflichtfeld,
   * kommt aus dem Stundennachweis-Formular (Zeile "Kunden-Nr. TN*in").
   *
   * Pre-Prod-Annahme: Migrationen, die diese Spalte einführen, leeren die
   * Tabelle (siehe scripts/apply-afa-form-migration.mjs). In Production
   * muss stattdessen der Drei-Schritt-Backfill gewählt werden: Spalte
   * nullable hinzufügen → vorhandene Zeilen füllen → auf NOT NULL setzen.
   */
  kundenNr: text("kunden_nr").notNull(),
  signatureUrl: text("signature_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const courseParticipants = pgTable(
  "course_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("course_participants_course_id_idx").on(t.courseId),
    uniqueIndex("course_participants_course_participant_uq").on(
      t.courseId,
      t.participantId,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    sessionDate: date("session_date").notNull(),
    /** Coaching-Themen / Maßnahme-Inhalte — kann länger sein, deshalb `text`. */
    topic: text("topic").notNull(),
    /** Unterrichtseinheiten dieser Session. `0` beim Erstgespräch, sonst 0.5er-Schritte. */
    anzahlUe: numeric("anzahl_ue", { precision: 3, scale: 1 }).notNull(),
    modus: sessionModus("modus").notNull(),
    /**
     * Das Erstgespräch ist eine Sonderzeile im AfA-Formular: zählt UE-mäßig
     * nicht (anzahl_ue = 0), braucht aber beidseitige Unterschrift und die
     * Zusatzangabe "geeignet JA/NEIN".
     */
    isErstgespraech: boolean("is_erstgespraech").notNull().default(false),
    /** Nur beim Erstgespräch relevant: TN*in für diese Maßnahme geeignet? */
    geeignet: boolean("geeignet"),
    status: sessionStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("sessions_course_id_idx").on(t.courseId),
    // Erstgespräch: UE=0 und geeignet gesetzt. Reguläre Session: UE>0 und geeignet=null.
    check(
      "sessions_erstgespraech_consistency",
      sql`(${t.isErstgespraech} = true AND ${t.anzahlUe} = 0 AND ${t.geeignet} IS NOT NULL)
         OR (${t.isErstgespraech} = false AND ${t.anzahlUe} > 0 AND ${t.geeignet} IS NULL)`,
    ),
  ],
);

/**
 * Magic-Link-Tokens, scope: **ein Kurs × ein Teilnehmer**, 24 h gültig.
 * Nicht one-shot: innerhalb der 24 h kann der Teilnehmer beliebige noch
 * offene Sessions des Kurses signieren. Wenn der Coach einen neuen Link
 * auslöst, wird der alte per `used_at=now()` invalidiert und ein neuer
 * angelegt.
 */
export const participantAccessTokens = pgTable(
  "participant_access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    // SHA-256-Hash des Tokens (base64url). Klartext wird nur in der
    // Magic-Link-Mail versendet, nie in der DB gespeichert.
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Wird gesetzt wenn ein neuer Token für dieselbe (course, participant)
    // ausgestellt wird — invalidiert den alten Link.
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("participant_access_tokens_hash_uq").on(t.tokenHash),
    index("participant_access_tokens_course_participant_idx").on(
      t.courseId,
      t.participantId,
    ),
  ],
);

export const signatures = pgTable(
  "signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    courseParticipantId: uuid("course_participant_id").references(
      () => courseParticipants.id,
      { onDelete: "restrict" },
    ),
    signerType: signerType("signer_type").notNull(),
    signatureUrl: text("signature_url").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address").notNull(),
  },
  (t) => [
    index("signatures_session_id_idx").on(t.sessionId),
    // Teilnehmer-Signaturen müssen genau eine course_participant-Zeile referenzieren,
    // Coach-Signaturen dürfen das nicht (sie gehören dem Coach der Session, nicht einem Teilnehmer).
    check(
      "signatures_signer_type_cp_consistency",
      sql`(${t.signerType} = 'participant' AND ${t.courseParticipantId} IS NOT NULL)
         OR (${t.signerType} = 'coach' AND ${t.courseParticipantId} IS NULL)`,
    ),
  ],
);

export const finalDocuments = pgTable("final_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id")
    .notNull()
    .unique()
    .references(() => courses.id, { onDelete: "cascade" }),
  pdfUrl: text("pdf_url").notNull(),
  /** Coach, der FES ausgelöst hat. Muss `coach_id` des Kurses sein. */
  sealedBy: uuid("sealed_by").references(() => users.id, {
    onDelete: "restrict",
  }),
  firmaEnvelopeId: text("firma_envelope_id"),
  fesStatus: fesStatus("fes_status").notNull().default("pending"),
  /**
   * AfA-Übermittlung ist Firma/Bildungsträger-Aufgabe — separat vom FES-Seal.
   * `submittedBy` referenziert den Bildungsträger-User, der die Übermittlung
   * ausgelöst hat. Wird später mit dem Rechnungsflow gekoppelt.
   */
  afaStatus: afaSubmissionStatus("afa_status").notNull().default("pending"),
  submittedToAfaAt: timestamp("submitted_to_afa_at", { withTimezone: true }),
  submittedBy: uuid("submitted_by").references(() => users.id, {
    onDelete: "restrict",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/**
 * Finale Freigabe eines Teilnehmers nach dem Preview — ohne FES, reiner
 * Audit-Nachweis ("Ich habe das Dokument gesehen und bestätige es für
 * die AfA-Übermittlung"). Sobald ALLE enrollten Teilnehmer eines Kurses
 * hier einen Eintrag haben, darf der Coach das PDF via Firma.dev siegeln.
 *
 * Unique(course_id, participant_id): jede Paarung genau einmal — erneute
 * Freigaben sind kein Use-Case (eine Korrektur am Dokument setzt den
 * Eintrag via separaten Flow zurück, später).
 */
export const participantApprovals = pgTable(
  "participant_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address").notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [
    uniqueIndex("participant_approvals_course_participant_uq").on(
      t.courseId,
      t.participantId,
    ),
    index("participant_approvals_course_idx").on(t.courseId),
  ],
);

/**
 * Generisches Audit-Log. Schreibt alles, was rechtlich/organisatorisch
 * nachvollziehbar sein muss: Impersonation-Events, Freigaben, FES-Seal,
 * AfA-Übermittlung.
 *
 * `actor_id` ist polymorph (users.id ODER participants.id) und bewusst
 * OHNE Foreign Key — sonst könnten wir weder Bildungsträger- noch Participant-
 * Zeilen schreiben, und soft-gelöschte User würden Audit-Einträge
 * ungültig machen. `actor_type` disambiguiert.
 *
 * Queries nach Monat/Jahr laufen über den `period_month`-Expression-
 * Index auf `date_trunc('month', created_at)`.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorType: auditActorType("actor_type").notNull(),
    /** users.id oder participants.id, je nach actor_type. Null bei actor_type='system'. */
    actorId: uuid("actor_id"),
    /**
     * Falls die Aktion unter Impersonation lief: die Bildungsträger-User-ID, die
     * den Coach gerade "fährt". Muss in jeder Write-Aktion miterfasst
     * werden (siehe CLAUDE.md → Impersonation).
     */
    impersonatorId: uuid("impersonator_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * Dotted Action, z.B. `course.seal`, `course.submit_afa`,
     * `participant.approve`, `impersonation.start`. Kein Enum, damit neue
     * Aktionen ohne Migration addierbar sind — Konsistenz per Konvention
     * und zentralem Helper in `src/lib/audit.ts`.
     */
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Chronologisch absteigend — das häufigste Query-Pattern ("zeig mir
    // die letzten N Einträge"). Reicht auch für Monats-Reports via Range:
    // `WHERE created_at >= start AND created_at < end` nutzt diesen Index.
    // (Ein Expression-Index auf date_trunc('month', ...) geht nicht, weil
    // date_trunc auf timestamptz STABLE statt IMMUTABLE ist.)
    index("audit_log_created_at_idx").on(t.createdAt.desc()),
    index("audit_log_resource_idx").on(t.resourceType, t.resourceId),
    index("audit_log_actor_idx").on(t.actorId, t.createdAt),
  ],
);

/**
 * TN-bezogener Abschlussbericht (BER). Ein BER gehört genau einem Teilnehmer in einem Kurs —
 * Unique-Index verhindert Duplikate. Nur Coach-der-Kurs darf schreiben/lesen, Bildungsträger hat
 * Read-Access für Überblick.
 *
 * DSGVO-Hintergrund: Inhalte hier dürfen **per Design** keine Art.-9-Daten enthalten —
 * der Checker ist ein harter Gate vor `submit`. Gespeichert werden also nur regulär-persönliche
 * Stammdaten des TN plus Coaching-Text (Art. 6(1)(b) DSGVO, Vertragserfüllung).
 */
export const abschlussberichte = pgTable(
  "abschlussberichte",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Nullable seit Ad-hoc-Submission via Schnell-Check: Coach reicht einen
     * Bericht ein, ohne dass TN als persistente Stammdaten existieren. Bei
     * Kurs-gebundenen BERs (BER-Editor-Pfad) sind beide gesetzt; bei
     * Ad-hoc-BERs sind beide null und die TN-Daten stehen in den
     * `tn_*`-Snapshot-Spalten.
     */
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "cascade",
    }),
    participantId: uuid("participant_id").references(() => participants.id, {
      onDelete: "restrict",
    }),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    teilnahme: text("teilnahme").notNull().default(""),
    ablauf: text("ablauf").notNull().default(""),
    fazit: text("fazit").notNull().default(""),
    /**
     * Optionales Freitextfeld für AVGS-Inhalte (GEPEDU-Test, Anerkennung
     * ausländischer Diplome, Tragfähigkeitsanalyse, …). Bewusst KEIN
     * `CheckerSection` — wird weder anonymisiert noch gegen den
     * Pflicht-Baustein-Katalog geprüft. Coach ist verantwortlich, hier keine
     * Klarnamen / Kunden-Nr. zu hinterlegen (Hinweistext steht im UI).
     */
    sonstiges: text("sonstiges").notNull().default(""),
    /**
     * "Keine Fehlzeiten"-Markierung — wenn `true` wird im PDF eine Pille im
     * Header gerendert. Default `false` ist neutral; ein Coach wählt es
     * explizit aus.
     */
    keineFehlzeiten: boolean("keine_fehlzeiten").notNull().default(false),
    /**
     * Wenn ein Coach für eine sehr kurze AVGS-Maßnahme (z.B. 5 UE
     * "Bewerbungsunterlagen optimieren") nicht alle Pflicht-Bausteine
     * bedienen kann, trägt er hier eine kurze Begründung ein. Die fehlenden
     * mustHaves werden dann zu Soft-Flags umgewandelt, der Submit-Gate
     * öffnet sich. `NULL` = kein Override. Wird sowohl beim BT-Detail
     * sichtbar (Audit) als auch beim PDF-Footer als Anmerkung gerendert.
     */
    mustHaveOverrideReason: text("must_have_override_reason"),
    /**
     * Snapshot der TN-Stammdaten zum Zeitpunkt des Submits. Wird sowohl bei
     * Kurs-gebundenen als auch bei Ad-hoc-BERs gefüllt — gibt der Bildungs-
     * träger-Liste eine einheitliche Datenquelle, ermöglicht Suche per
     * `tn_nachname`/`tn_kunden_nr` ohne Joins, und sorgt für stabile
     * PDF-Dateinamen, auch wenn Stammdaten später geändert werden.
     */
    tnVorname: text("tn_vorname").notNull().default(""),
    tnNachname: text("tn_nachname").notNull().default(""),
    tnKundenNr: text("tn_kunden_nr").notNull().default(""),
    tnAvgsNummer: text("tn_avgs_nummer").notNull().default(""),
    tnZeitraum: text("tn_zeitraum").notNull().default(""),
    tnUe: text("tn_ue").notNull().default(""),
    coachNameSnapshot: text("coach_name_snapshot").notNull().default(""),
    status: berStatus("status").notNull().default("draft"),
    /**
     * Hat die letzte finale Prüfung (nicht nur Live-Regex) bestanden?
     * `submit` setzt das Flag und cacht das Ergebnis — UI zeigt "eingereicht mit
     * bestandener Prüfung" als Qualitätssignal.
     */
    lastCheckPassed: boolean("last_check_passed").notNull().default(false),
    /**
     * Snapshot des CheckerResult vom letzten Submit. Enthält mustHaves,
     * violations (inkl. severity) und ggf. tonalityFeedback — damit der
     * Bildungsträger im Detail-View sieht, welche soft_flags der Coach
     * „durchgelassen" hat und sie ggf. acknowledgen kann.
     */
    checkSnapshot: jsonb("check_snapshot"),
    /**
     * Wurde vom Bildungsträger gesetzt, wenn die soft_flags geprüft und
     * akzeptiert wurden (Freigabe trotz Hinweisen). Null = noch nicht
     * acknowledged. Wird bei Re-Submit des Coaches auf null zurückgesetzt,
     * damit ein geänderter Bericht neu geprüft wird.
     */
    softFlagsAcknowledgedAt: timestamp("soft_flags_acknowledged_at", {
      withTimezone: true,
    }),
    softFlagsAcknowledgedBy: uuid("soft_flags_acknowledged_by").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Unique nur für Kurs-gebundene BERs. Postgres NULL-Semantik in Unique-
    // Indexen erlaubt mehrere Ad-hoc-Rows mit beiden Spalten = NULL — genau
    // was wir wollen, jeder Schnell-Check-Submit ist ein eigener Eintrag.
    uniqueIndex("abschlussberichte_course_participant_uq").on(
      t.courseId,
      t.participantId,
    ),
    index("abschlussberichte_course_idx").on(t.courseId),
    index("abschlussberichte_coach_idx").on(t.coachId),
    index("abschlussberichte_status_idx").on(t.status),
    // Suche-Indizes für die Bildungsträger-Liste (TN-Name, Kd-Nr).
    index("abschlussberichte_tn_nachname_idx").on(t.tnNachname),
    index("abschlussberichte_tn_kunden_nr_idx").on(t.tnKundenNr),
    // Integritäts-Anker für Kurs-gebundene BERs: muss eine echte Enrollment-
    // Zeile geben. NULL-tolerant: bei Ad-hoc-Rows sind courseId/participantId
    // null, dann wird der FK von Postgres übersprungen (NULL ≠ NULL).
    foreignKey({
      columns: [t.courseId, t.participantId],
      foreignColumns: [courseParticipants.courseId, courseParticipants.participantId],
      name: "abschlussberichte_course_participant_enrollment_fk",
    }).onDelete("cascade"),
    // Submit-Invariante: 'submitted' nur mit Timestamp UND bestandener Prüfung.
    check(
      "abschlussberichte_submit_invariants",
      sql`(${t.status} = 'draft') OR (${t.status} = 'submitted' AND ${t.submittedAt} IS NOT NULL AND ${t.lastCheckPassed} = true)`,
    ),
    // Kurs-gebunden vs. Ad-hoc: entweder beide FKs gesetzt oder beide null.
    // Verhindert halb-konsistente Rows mit nur courseId oder nur participantId.
    check(
      "abschlussberichte_course_participant_paired",
      sql`(${t.courseId} IS NULL AND ${t.participantId} IS NULL) OR (${t.courseId} IS NOT NULL AND ${t.participantId} IS NOT NULL)`,
    ),
    // Ad-hoc-BERs müssen TN-Snapshot-Daten haben — sonst kein PDF/keine
    // Suche möglich. Bei Kurs-gebundenen Rows wird der Snapshot beim Submit
    // ebenfalls befüllt (Application-Code, nicht Constraint).
    check(
      "abschlussberichte_adhoc_requires_tn_snapshot",
      sql`(${t.courseId} IS NOT NULL) OR (length(trim(${t.tnVorname})) > 0 AND length(trim(${t.tnNachname})) > 0)`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type Bedarfstraeger = typeof bedarfstraeger.$inferSelect;
export type NewBedarfstraeger = typeof bedarfstraeger.$inferInsert;
export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
export type CourseParticipant = typeof courseParticipants.$inferSelect;
export type NewCourseParticipant = typeof courseParticipants.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type ParticipantAccessToken =
  typeof participantAccessTokens.$inferSelect;
export type NewParticipantAccessToken =
  typeof participantAccessTokens.$inferInsert;
export type Signature = typeof signatures.$inferSelect;
export type NewSignature = typeof signatures.$inferInsert;
export type FinalDocument = typeof finalDocuments.$inferSelect;
export type NewFinalDocument = typeof finalDocuments.$inferInsert;
export type ParticipantApproval = typeof participantApprovals.$inferSelect;
export type NewParticipantApproval = typeof participantApprovals.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
export type Abschlussbericht = typeof abschlussberichte.$inferSelect;
export type NewAbschlussbericht = typeof abschlussberichte.$inferInsert;
export type AuthSession = typeof authSession.$inferSelect;
export type AuthAccount = typeof authAccount.$inferSelect;
export type AuthVerification = typeof authVerification.$inferSelect;

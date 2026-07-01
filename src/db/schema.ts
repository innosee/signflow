import { sql } from "drizzle-orm";
import type { Eignungsanalyse } from "@/lib/eignung";
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
  unique,
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
 * AVGS-Maßnahmentyp gemäß § 45 SGB III. Werte-Set parallel zu
 * `MassnahmeTyp` in `src/lib/checker/types.ts`:
 *   - EKC = Erango Karriere-Coaching
 *   - ESC = Erango Standort-Coaching (gleiches Baustein-Set wie EKC)
 *   - EGC = Erango Gründungs-Coaching
 *   - ESCA = Erango Ausbildungs-Coaching / Probezeitbegleitung
 * Wird vom ANW-Compliance-Check gelesen, um den „roten Faden" der
 * Sessions gegen die Phasen der gebuchten Maßnahme abzugleichen.
 */
export const massnahmeTyp = pgEnum("massnahme_typ", ["EKC", "ESC", "EGC", "ESCA"]);
/**
 * Deutsches Bundesland des Kunden — alleinige Grundlage für die Feiertags-
 * Berechnung (`src/lib/feiertage.ts`). Coachings finden an Feiertagen nicht
 * statt; die Termin-Anlage warnt anhand dieses Felds. Bewusst NUR das Bundesland
 * (kein Ort/PLZ/Geolocation): deutsche Feiertage hängen ausschließlich am
 * Bundesland, der Rest ist berechenbar. ISO-3166-2:DE-Codes. Werte-Set parallel
 * zu `Bundesland` in `src/lib/feiertage.ts`.
 */
export const bundesland = pgEnum("bundesland", [
  "BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV",
  "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH",
]);
/**
 * Status der Bildungsträger-Prüfung vor der FES-Versiegelung. Der
 * Bildungsträger ist die Entität, die an die AfA übermittelt — deshalb
 * muss er JEDE Anwesenheitsliste vor dem Siegel freigeben.
 *   - `none`              = noch nicht zur Prüfung eingereicht (Default)
 *   - `pending`           = Coach hat eingereicht, BT muss entscheiden
 *   - `changes_requested` = BT fordert Nachbesserung; Coach editiert
 *   - `approved`          = BT hat freigegeben → FES-Button beim Coach frei
 * Wird bei jeder Session-Änderung auf `none` zurückgesetzt — eine alte
 * Freigabe bezeugt sonst einen Stand, den das Dokument nicht mehr hat.
 */
export const courseReviewStatus = pgEnum("course_review_status", [
  "none",
  "pending",
  "changes_requested",
  "approved",
]);
/** Wer hat eine Prüf-Notiz verfasst — immer ein Coach oder ein Bildungsträger. */
export const courseReviewNoteAuthor = pgEnum("course_review_note_author", [
  "coach",
  "bildungstraeger",
]);
/**
 * Art einer Prüf-Notiz im Review-Thread:
 *   - `submit`  = Coach reicht zur Prüfung ein (enthält ggf. die Begründung
 *                 bei vorzeitigem Ende / unvollständigen UE)
 *   - `approve` = BT gibt frei
 *   - `changes` = BT fordert Nachbesserung (Pflicht-Notiz)
 *   - `comment` = freie Rückmeldung ohne Statuswechsel
 */
export const courseReviewNoteKind = pgEnum("course_review_note_kind", [
  "submit",
  "approve",
  "changes",
  "comment",
]);
/**
 * Lebenszyklus eines Abschlussberichts.
 * `draft` = Coach arbeitet noch dran (Autosave); `submitted` = Coach hat an die Bildungsträgerin
 * abgegeben. Edit nach Submit bleibt erlaubt (Korrekturen); Status ändert sich dadurch nicht,
 * nur `updated_at` läuft hoch.
 */
export const berStatus = pgEnum("ber_status", ["draft", "submitted"]);

/**
 * Mandant (Bildungsträger-Organisation). Single-Tenant war der Stand bis
 * 2026-05; mit dem Multi-Tenant-Refactor sind Coaches, Bedarfsträger und
 * Teilnehmer pro Tenant isoliert. Der `bildungstraeger`-Rolle-User ist der
 * Admin innerhalb seines Tenants — für die Org-Daten (Branding, Adresse)
 * gilt dieser Eintrag.
 *
 * Slug wird intern für Logs/Subdomain-fähigen URL-Aufbau verwendet, ist
 * aber nicht öffentlich. `default` ist der Erango-Bestand zum Zeitpunkt
 * der Einführung — kann später umbenannt werden.
 */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  // Partial unique — gelöschte Tenants sollen ihre Slug nicht ewig blockieren.
  uniqueIndex("tenants_slug_active_uq")
    .on(t.slug)
    .where(sql`${t.deletedAt} IS NULL`),
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Tenant-Zugehörigkeit. Ein User gehört zu genau einem Tenant; Coaches
     * sehen nur Kurse/TN/BERs ihres Tenants, Bildungsträger-Admins
     * verwalten nur ihren Tenant. Setzt jede DB-Query in der Codebase
     * unter Tenant-Filter-Pflicht.
     */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
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
    /**
     * Letzter Zeitpunkt, zu dem der User die „Neu"-Changelog-Seite gesehen
     * hat. `null` = noch nie geöffnet → alle veröffentlichten Einträge gelten
     * als ungelesen. Steuert das blaue Badge im AppHeader.
     */
    changelogLastSeenAt: timestamp("changelog_last_seen_at", {
      withTimezone: true,
    }),
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

/**
 * Produkt-Changelog („Neu"-Seite). Globale News, vom Operator (innosee)
 * verfasst — bewusst NICHT tenant- oder user-gebunden, sondern für alle
 * eingeloggten User sichtbar. Plaintext-Body (mit Zeilenumbrüchen, React
 * escaped beim Rendern). Soft-Delete für versehentliche Einträge.
 */
export const changelogEntries = pgTable(
  "changelog_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    index("changelog_entries_published_idx").on(t.publishedAt.desc()),
  ],
);

/**
 * Tenant-Mitgliedschaften — ein User (eine Identität, eine E-Mail, ein Login)
 * kann bei MEHREREN Bildungsträgern arbeiten (Coaches arbeiten oft für mehrere
 * Träger). Jede Mitgliedschaft trägt die **tenant-spezifische** Rolle und den
 * `signing_enabled`-Flag — derselbe Mensch kann bei Träger A Coach mit
 * Signatur-Recht sein, bei Träger B (noch) nicht.
 *
 * Phase 0 (additiv): Die Tabelle existiert, aber das Tenant-Scoping läuft
 * weiter über `users.tenant_id/role` — Backfill spiegelt jede aktive
 * User-Zeile in genau eine Mitgliedschaft. Ab Phase 1 liest die App den
 * aktiven Tenant + die aktive Rolle hieraus (über den `getTenantId`-
 * Chokepoint), `users.tenant_id/role` werden zur „Heimat"-Default.
 *
 * Bewusst KEIN Tausch des globalen `users_email_active_uq` — die E-Mail bleibt
 * global eindeutig (ein Login pro Person), die Mehrfach-Zugehörigkeit hängt
 * allein an dieser Tabelle.
 */
export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Rolle DIESER Person in DIESEM Tenant. Reuse des globalen user_role-Enums. */
    role: userRole("role").notNull().default("coach"),
    /** Signatur-Flag pro Träger (Pilot-Rollout ist tenant-spezifisch). */
    signingEnabled: boolean("signing_enabled").notNull().default(false),
    /**
     * Zeitpunkt der Einladungs-Annahme. NULL = offene Einladung (zählt NICHT
     * als aktive Mitgliedschaft, gibt keinen Zugriff). Gesetzt = angenommen.
     * Selbst erstellte Mitgliedschaften (eigener BT, Self-Registrierung,
     * neu/wiederbelebter Coach via Passwort-Link) werden sofort als angenommen
     * angelegt; nur das Einladen einer BEREITS bestehenden Identität erzeugt
     * eine offene Einladung, die die Person aktiv annehmen muss.
     */
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
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
    // Eine aktive Mitgliedschaft je (User × Tenant). Partial-Unique, damit eine
    // entfernte (soft-deleted) Mitgliedschaft später neu vergeben werden kann.
    uniqueIndex("tenant_memberships_user_tenant_active_uq")
      .on(t.userId, t.tenantId)
      .where(sql`${t.deletedAt} IS NULL`),
    index("tenant_memberships_user_idx").on(t.userId),
    index("tenant_memberships_tenant_idx").on(t.tenantId),
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
  /** Mandant, dem dieser Bedarfsträger gehört. Gleiche Behörde kann von
   * mehreren Bildungsträgern unabhängig gepflegt werden. */
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "restrict" }),
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
}, (t) => [
  index("bedarfstraeger_tenant_idx").on(t.tenantId),
]);

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  coachId: uuid("coach_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  /**
   * Der eine Kunde dieser Maßnahme (1:1-Modell). Ein „Kurs" ist genau ein
   * Kunde mit genau einem Unterschreiber. Personendaten (Name/E-Mail/
   * Kunden-Nr/Signatur) leben weiter in `participants` (Single-Source);
   * diese Spalte ist die 1:1-Bindung. Die früheren Join-Tabellen
   * `course_participants`/`session_participants` sind damit entfallen.
   */
  participantId: uuid("participant_id")
    .notNull()
    .references(() => participants.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  /** AVGS-Maßnahmen-Nummer (von der AfA vergeben). */
  avgsNummer: text("avgs_nummer").notNull(),
  /** Durchführungs-Ort (z.B. "Online" oder "Singen, Erzbergerstr. 10"). */
  durchfuehrungsort: text("durchfuehrungsort").notNull(),
  /**
   * Bundesland des Kunden — Grundlage für die Feiertags-Warnung bei der
   * Termin-Anlage (`src/lib/feiertage.ts`). Nullable, weil Bestandskurse
   * (vor Einführung) kein Bundesland haben; für die sind Feiertags-Hinweise
   * dann schlicht aus (kein falscher Default — ein geratenes Bundesland würde
   * sonst flächendeckend falsche Warnungen erzeugen). Neue Kunden setzen es
   * im BT-Anlageformular als Pflichtfeld.
   */
  bundesland: bundesland("bundesland"),
  /** Bewilligte Unterrichtseinheiten gesamt (ganzzahlig, z.B. 80). */
  anzahlBewilligteUe: integer("anzahl_bewilligte_ue").notNull(),
  bedarfstraegerId: uuid("bedarfstraeger_id")
    .notNull()
    .references(() => bedarfstraeger.id, { onDelete: "restrict" }),
  /**
   * AVGS-Maßnahmentyp gemäß § 45 SGB III. Wird vom ANW-Compliance-Check
   * gebraucht, um den „roten Faden" der Session-Themen gegen die
   * Phasenbausteine der gebuchten Maßnahme abzugleichen (EKC-Startphase
   * vs. EGC-Konzeptarbeit etc.). Default `EKC` weil das die historisch
   * häufigste Maßnahme ist und beim Backfill der Bestandskurse die
   * unschädlichste Annahme ist (Bausteine sehr ähnlich zu ESC).
   */
  massnahmeTyp: massnahmeTyp("massnahme_typ").notNull().default("EKC"),
  /**
   * AVGS-Gutschein-Gültigkeit (steht auf dem Gutschein, bei Anlage bekannt).
   * Pflicht. Sowohl das vereinbarte `startDate` als auch der erste Termin
   * müssen in dieses Fenster [von, bis] fallen — rechtlich bindende AfA-Frist.
   */
  avgsGueltigVon: date("avgs_gueltig_von").notNull(),
  avgsGueltigBis: date("avgs_gueltig_bis").notNull(),
  /**
   * Startdatum: wird NACH dem Erstgespräch mit dem Kunden vereinbart, muss in
   * der Gutschein-Gültigkeit liegen, und wird damit bei der AA/JC eingereicht.
   * Bis dahin null (gestufte Erfassung). Der Bewilligungszeitraum-von wird mit
   * diesem Startdatum gleichgesetzt — keine eigene Spalte.
   */
  startDate: date("start_date"),
  /**
   * Bewilligungsende: kommt mit der Bewilligung von der AA/JC zurück. Der letzte
   * Termin muss ≤ diesem Datum liegen. Bis zur Bewilligung null (gestuft).
   */
  endDate: date("end_date"),
  /**
   * Explizites Bewilligungs-Flag (gesetzt = "Bewilligt"). Vom BT manuell per
   * Häkchen/Button gesetzt — ENTKOPPELT vom `endDate`. Früher wurde "Bewilligt"
   * aus `endDate IS NOT NULL` abgeleitet; das zwang den BT, das Enddatum bis zur
   * Bewilligung leer zu lassen. Jetzt kann das Enddatum jederzeit erfasst werden,
   * ohne den Status auf "Bewilligt" zu ziehen. Migration backfillt Bestandskunden
   * mit gesetztem Enddatum, damit nichts zurückspringt.
   */
  bewilligtAt: timestamp("bewilligt_at", { withTimezone: true }),
  status: courseStatus("status").notNull().default("active"),
  /**
   * Ergänzende Angaben / Begründungen für den AfA-Footer. Werden auf jedem
   * Blatt des finalen PDFs ausgegeben. Checkboxen + Freitext.
   */
  flagUnter2Termine: boolean("flag_unter_2_termine").notNull().default(false),
  /**
   * ZEITLICH vorzeitiges Ende: letzter Termin liegt vor dem Bewilligungsende
   * (`endDate`). Kann auch bei voller UE-Zahl auftreten (komprimierter Ablauf)
   * — dann nur Hinweis, KEINE Begründungspflicht. Wird beim Abschluss gesetzt.
   */
  flagVorzeitigesEnde: boolean("flag_vorzeitiges_ende")
    .notNull()
    .default(false),
  /**
   * UE-Unterschreitung: weniger UE durchgeführt als bewilligt. Eigene Achse,
   * unabhängig vom zeitlichen Ende — löst die Begründungspflicht aus.
   */
  flagUeUnterschritten: boolean("flag_ue_unterschritten")
    .notNull()
    .default(false),
  begruendungText: text("begruendung_text"),
  /**
   * FES-Gate (1/2): Coach-Klick „Maßnahme als abgeschlossen markieren".
   * Der Coach bestätigt damit aktiv, dass keine weiteren Sessions mehr
   * kommen. Bei jeder Session-Änderung (create/update/reopen) wird das
   * Feld zurückgesetzt → der Coach muss neu bestätigen.
   */
  abgeschlossenAt: timestamp("abgeschlossen_at", { withTimezone: true }),
  /**
   * FES-Gate (2/2): Zeitpunkt, an dem der ANW-Compliance-Check zuletzt
   * mit Status „freigabe" lief. Bei jeder Session-Änderung zurückgesetzt
   * — das Dokument hat sich geändert, alter Check-Status nicht mehr
   * aussagekräftig.
   */
  anwCheckPassedAt: timestamp("anw_check_passed_at", { withTimezone: true }),
  /**
   * FES-Gate (3/3): Bildungsträger-Prüfung. Der Coach reicht die fertige,
   * vom Kunden freigegebene Anwesenheitsliste zur Prüfung ein; erst wenn
   * `reviewStatus = 'approved'` ist, darf die FES-Versiegelung laufen.
   * Bei jeder Session-Änderung zusammen mit den anderen Gates auf `none`
   * zurückgesetzt. Siehe `courseReviewStatus`.
   */
  reviewStatus: courseReviewStatus("review_status").notNull().default("none"),
  /** Zeitpunkt der letzten Einreichung des Coaches zur BT-Prüfung. */
  reviewRequestedAt: timestamp("review_requested_at", { withTimezone: true }),
  /** Zeitpunkt der letzten BT-Entscheidung (Freigabe oder Nachbesserung). */
  reviewDecidedAt: timestamp("review_decided_at", { withTimezone: true }),
  /** Bildungsträger-User, der zuletzt entschieden hat. */
  reviewDecidedBy: uuid("review_decided_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  // 1:1-Integritäts-Anker: `id` ist bereits PK, aber dieser Composite-Unique
  // macht die Paarung (Kurs ↔ sein Kunde) als FK-Ziel referenzierbar — der
  // Abschlussbericht hängt seinen Enrollment-FK darauf. Muss ein Unique-
  // CONSTRAINT sein (nicht nur -Index), sonst akzeptiert Postgres es nicht
  // als FK-Ziel (Fehler 42830).
  unique("courses_id_participant_uq").on(t.id, t.participantId),
]);

/**
 * Kompetenzteam einer Maßnahme: welche Coaches sind für diesen Kunden
 * **freigegeben** (1–n). Wird ausschließlich vom Bildungsträger gesetzt
 * (Kunden-Anlage/-Bearbeitung). Steuert:
 *  - Sichtbarkeit: ein Coach sieht die Maßnahme, wenn er im Team ist.
 *  - Termin-Anlage: nur Team-Coaches; ein Coach weist Termine NUR sich selbst
 *    zu (Datenschutz — kein Zugriff auf den gesamten Tenant-Roster).
 *  - Abschluss-Schritte: jeder Team-Coach darf sie auslösen (kein Lead-Sonder-
 *    recht). `courses.coach_id` bleibt nur als „primärer"/anlegender Coach für
 *    Back-Compat + FK-Ziele bestehen und ist ebenfalls Team-Mitglied.
 *
 * Hartes Add/Remove (kein Soft-Delete) — eine Team-Änderung ist eine bewusste
 * BT-Entscheidung; ein entfernter Coach verliert den Zugriff sofort.
 */
export const courseCoaches = pgTable(
  "course_coaches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("course_coaches_course_coach_uq").on(t.courseId, t.coachId),
    index("course_coaches_course_idx").on(t.courseId),
    index("course_coaches_coach_idx").on(t.coachId),
  ],
);

export const participants = pgTable("participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  /**
   * Mandant, der diesen Teilnehmer betreut. Derselbe Mensch (gleiche E-Mail)
   * kann bei mehreren Bildungsträgern parallel Kunde sein — Unique deshalb
   * auf `(tenant_id, email)` statt global.
   */
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
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
  /**
   * Optionale Telefonnummer im E.164-Format (z.B. `+4915712345678`).
   * Wird ausschließlich für Magic-Link-Versand per SMS verwendet, falls
   * der Coach diesen Channel statt E-Mail wählt. NULL bedeutet: nur
   * E-Mail möglich. Validierung beim Erfassen, nicht im DB-Constraint —
   * Migrationen aus dem Bestand sollen nicht an Format-Strenge scheitern.
   */
  phone: text("phone"),
  signatureUrl: text("signature_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("participants_tenant_email_uq").on(t.tenantId, t.email),
  index("participants_tenant_idx").on(t.tenantId),
]);

// 1:1-Modell: Die frühere Join-Tabelle `course_participants` ist entfallen.
// Die Kunde↔Kurs-Bindung läuft jetzt direkt über `courses.participant_id`.

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /**
     * Kompetenzteams (mehrere Coaches je Maßnahme, Variante A): der Coach,
     * der DIESEN Termin hält und signiert. `courses.coach_id` bleibt der
     * Lead-Coach (legt an, steuert Abschluss/Preview/BT-Einreichung/FES);
     * pro Termin kann ein anderer Coach desselben Tenants zugewiesen sein.
     *
     * Nullable, weil die Spalte additiv eingeführt wird (Bestands-Termine
     * werden auf `courses.coach_id` zurück-gebackfillt) — app-seitig ist die
     * Zuweisung Pflicht (Default = Lead). Ein signierter Termin darf seinen
     * Coach nicht mehr wechseln (Beweiskraft), das wird in den Actions
     * erzwungen. `restrict` parallel zu `courses.coach_id` — Coaches werden
     * soft-deleted, nicht hart entfernt.
     */
    coachId: uuid("coach_id").references(() => users.id, {
      onDelete: "restrict",
    }),
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
    /** Nur beim Erstgespräch relevant: TN*in für diese Maßnahme geeignet? (Gesamtergebnis) */
    geeignet: boolean("geeignet"),
    /**
     * Eignungsanalyse beim Erstgespräch: 4 Kriterien (Motivation, Bedarfe,
     * Sprachniveau, Kompetenzen) je Bewertung '++'/'o'/'--'. Nur beim
     * Erstgespräch gesetzt. Alt-Erstgespräche (vor 2026-06-16) haben nur
     * `geeignet` und hier NULL — die DB-CHECK bleibt deshalb unverändert,
     * Vollständigkeit wird app-seitig für neue Erstgespräche erzwungen.
     */
    eignungsanalyse: jsonb("eignungsanalyse").$type<Eignungsanalyse>(),
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
    // Dashboard-Sichtbarkeit (Kompetenzteams): „welche Termine sind diesem
    // Coach zugewiesen" — gefiltert über coach_id.
    index("sessions_coach_id_idx").on(t.coachId),
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
 * offene Sessions des Kurses signieren. Löst der Coach einen neuen Link aus,
 * wird der alte NICHT mehr invalidiert (geändert 2026-06-19) — jeder Link
 * lebt bis zu seinem eigenen `expires_at`, mehrere aktive Links pro Paarung
 * sind erlaubt (alle zeigen auf dieselbe Sign-Seite). So funktioniert auch
 * eine ältere Mail noch, solange sie nicht abgelaufen ist.
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
    // Expliziter Revoke-Marker. Re-Issue invalidiert alte Links NICHT mehr
    // (seit 2026-06-19, mehrere aktive Links pro Paarung erlaubt). used_at wird
    // nur beim aktiven Revoke gesetzt — z.B. wenn der BT die Kunden-E-Mail
    // korrigiert und die an die alte Adresse verschickten Links wertlos werden.
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

// 1:1-Modell: Die frühere Tabelle `session_participants` (Anwesenheit pro
// Session) ist entfallen. Jeder Termin gehört implizit dem einen Kunden des
// Kurses — eine explizite Anwesenheits-Auswahl gibt es nicht mehr.

export const signatures = pgTable(
  "signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    // 1:1-Modell: Teilnehmer-Signaturen referenzieren den Kunden direkt
    // (participants.id), Coach-Signaturen lassen das NULL.
    participantId: uuid("participant_id").references(() => participants.id, {
      onDelete: "restrict",
    }),
    /**
     * Kompetenzteams: WELCHER Coach diese Signatur geleistet hat — durable
     * fürs Audit, unabhängig von einer späteren Termin-Zuweisung. Nur bei
     * Coach-Signaturen gesetzt (Teilnehmer-Signaturen lassen das NULL).
     * Nullable, weil additiv eingeführt; Bestands-Coach-Signaturen werden auf
     * den damaligen Einzel-Coach (`courses.coach_id`) gebackfillt. Ab Phase 4
     * setzt der Sign-Flow die Spalte; die App erzwingt, dass ein Coach nur
     * eigene (ihm zugewiesene) Termine signiert. `restrict` parallel zu
     * `sessions.coach_id` (Coaches werden soft-deleted).
     */
    coachId: uuid("coach_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    signerType: signerType("signer_type").notNull(),
    signatureUrl: text("signature_url").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address").notNull(),
  },
  (t) => [
    index("signatures_session_id_idx").on(t.sessionId),
    // Teilnehmer-Signaturen müssen genau einen Kunden (participant) referenzieren,
    // Coach-Signaturen dürfen das nicht (sie gehören dem Coach der Session, nicht dem Kunden).
    check(
      "signatures_signer_type_participant_consistency",
      sql`(${t.signerType} = 'participant' AND ${t.participantId} IS NOT NULL)
         OR (${t.signerType} = 'coach' AND ${t.participantId} IS NULL)`,
    ),
    // Nur Coach-Signaturen tragen einen coach_id (wer hat signiert). Teilnehmer-
    // Signaturen lassen die Spalte NULL. Coach-Signaturen DÜRFEN noch NULL sein,
    // bis der Sign-Flow (Phase 4) die Spalte befüllt — deshalb hier nur die
    // Teilnehmer-Seite hart.
    check(
      "signatures_participant_no_coach",
      sql`${t.signerType} = 'coach' OR ${t.coachId} IS NULL`,
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
 * Notiz-Thread der Bildungsträger-Prüfung (FES-Gate 3/3). Bildet die
 * Kommunikation Coach ↔ Bildungsträger über mehrere Nachbesserungs-Runden
 * ab: der Coach reicht ein (`submit`, ggf. mit Begründung), der BT gibt
 * frei (`approve`) oder fordert Nachbesserung (`changes`, Pflicht-Text).
 * Bewusst KEIN Chat-System — nur ein append-only Verlauf pro Kurs, der die
 * Prüf-Entscheidungen nachvollziehbar macht. `author_id` ist immer ein
 * `users`-Row (Coach oder BT), nie ein Participant.
 */
export const courseReviewNotes = pgTable(
  "course_review_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    authorType: courseReviewNoteAuthor("author_type").notNull(),
    /** users.id des Coaches bzw. Bildungsträgers. Coaches/BT werden soft-deleted, daher restrict. */
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: courseReviewNoteKind("kind").notNull(),
    /** Freitext. Bei `changes` Pflicht (action-seitig erzwungen), sonst optional. */
    body: text("body"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("course_review_notes_course_idx").on(t.courseId, t.createdAt),
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
    // Integritäts-Anker für Kurs-gebundene BERs: der (course, participant) muss
    // der 1:1-Paarung des Kurses entsprechen (courses.id ↔ courses.participant_id).
    // NULL-tolerant: bei Ad-hoc-Rows sind courseId/participantId null, dann wird
    // der FK von Postgres übersprungen (NULL ≠ NULL).
    foreignKey({
      columns: [t.courseId, t.participantId],
      foreignColumns: [courses.id, courses.participantId],
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

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type TenantMembership = typeof tenantMemberships.$inferSelect;
export type NewTenantMembership = typeof tenantMemberships.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type CourseCoach = typeof courseCoaches.$inferSelect;
export type NewCourseCoach = typeof courseCoaches.$inferInsert;
export type Bedarfstraeger = typeof bedarfstraeger.$inferSelect;
export type NewBedarfstraeger = typeof bedarfstraeger.$inferInsert;
export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
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

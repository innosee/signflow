import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import {
  adminAc,
  userAc,
} from "better-auth/plugins/admin/access";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { sendResetPasswordEmail } from "@/lib/email";

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is not set");
}

const configuredUrl =
  process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;

// Vercel-Preview-Deployments (Feature-Branches) bekommen die URL-Env-Variablen
// NICHT — die sind bewusst nur im Production-Scope gesetzt, damit Reset/Invite-
// Links immer auf die echte Domain (signflow.coach) zeigen. Ohne Fallback wirft
// der `next build` im Preview aber (er läuft mit NODE_ENV=production). Vercel
// setzt für JEDES Deployment automatisch `VERCEL_URL` (= die Deploy-URL ohne
// Protokoll) und `VERCEL_ENV`. Im Preview fallen wir darauf zurück, sodass jeder
// Preview self-configured auf seine eigene URL baut und läuft.
const previewFallbackUrl =
  process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : undefined;

const resolvedUrl = configuredUrl ?? previewFallbackUrl;

// In echter Production (nicht Preview) bleibt der harte Guard: fehlt die explizit
// gesetzte URL, brechen wir laut ab, statt still auf localhost zu fallen.
if (!resolvedUrl && process.env.NODE_ENV === "production") {
  throw new Error(
    "BETTER_AUTH_URL (or NEXT_PUBLIC_APP_URL) must be set in production — " +
      "otherwise Better Auth falls back to localhost and breaks Reset/Invite links.",
  );
}

const appUrl = resolvedUrl ?? "http://localhost:3000";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: appUrl,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  advanced: {
    database: {
      generateId: false,
    },
  },

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    // Reset-/Onboarding-Links: Better-Auth-Default ist nur 1 h — viel zu kurz
    // für „Passwort festlegen"-Mails. Neue Bildungsträger/Coaches klicken den
    // Link oft erst Stunden später → Token abgelaufen → Onboarding scheitert
    // (User-Report Angela M., 2026-06-30). 24 h, analog zu den Teilnehmer-
    // Magic-Links. Bei abgelaufenem Token leitet Better-Auth auf
    // `/reset-password?error=INVALID_TOKEN` — die Seite bietet dann einen
    // „neuen Link anfordern"-Weg an.
    resetPasswordTokenExpiresIn: 60 * 60 * 24,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail({
        to: user.email,
        name: user.name,
        url,
      });
    },
    // Der Invite-Flow für Coaches läuft über `requestPasswordReset` — nach
    // Klick auf den Link hat der Coach seine Mailbox-Zugehörigkeit bewiesen
    // und ein Passwort gesetzt. Das ist unser Signal „Einladung angenommen",
    // auf das die Bildungsträger-UI über `emailVerified` prüft.
    onPasswordReset: async ({ user }) => {
      await db
        .update(schema.users)
        .set({ emailVerified: true })
        .where(eq(schema.users.id, user.id));
    },
  },

  session: {
    // 12h Hard-Cap statt 7 Tage SaaS-Default. Begründung: Signflow verarbeitet
    // AfA-Sozialdaten und (über den Checker) Art.-9-relevante Inhalte —
    // 7 Tage Persistenz-Sessions wären für diesen Kontext zu lang. 12h
    // erlaubt einen ganzen Arbeitstag eingeloggt zu bleiben, erzwingt aber
    // beim nächsten Tag einen Re-Login (Laptop-über-Nacht-offen-Szenario).
    //
    // updateAge=1h heißt: aktive Sessions werden stündlich verlängert,
    // aber nur bis zur expiresIn-Grenze. Idle-Timeout (Auto-Logout bei
    // Inaktivität) bewusst NICHT eingebaut — Mehrwert ist im AfA-Kontext
    // gering, UX-Kosten sind hoch, und das 12h-Hard-Cap deckt das
    // DSGVO-relevante Worst-Case-Szenario.
    expiresIn: 60 * 60 * 12, // 12h
    updateAge: 60 * 60 * 1, // Session-Refresh stündlich bei Aktivität
    modelName: "authSession",
    // impersonatedBy wird vom admin-Plugin selbst registriert (siehe
    // better-auth/plugins/admin/schema). Kein manuelles additionalFields
    // nötig — und vor allem kein `fieldName`-Override, weil Drizzle
    // Spalten unter dem TS-Key exposed, nicht unter dem SQL-Namen.
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 300, max: 5 }, // 5 Versuche / 5min pro IP
      "/forget-password": { window: 900, max: 3 },
      "/reset-password": { window: 900, max: 5 },
    },
  },

  user: {
    modelName: "users",
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "coach",
        input: false,
      },
      tenantId: {
        // Mandant des Users. Wird beim Coach-Invite vom server-seitigen
        // Caller (admin.createUser) mitgegeben — niemals aus Client-Input,
        // weil die einzigen User-Erstell-Pfade Server-Actions sind und
        // `disableSignUp: true` den offenen Signup blockt.
        type: "string",
        required: false,
        input: true,
      },
      signatureUrl: {
        type: "string",
        required: false,
        input: false,
      },
      deletedAt: {
        type: "date",
        required: false,
        input: false,
      },
      banned: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      banReason: {
        type: "string",
        required: false,
        input: false,
      },
      banExpires: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },


  account: { modelName: "authAccount" },
  verification: { modelName: "authVerification" },

  plugins: [
    admin({
      defaultRole: "coach",
      adminRoles: ["bildungstraeger"],
      impersonationSessionDuration: 60 * 60, // 1h
      roles: { bildungstraeger: adminAc, coach: userAc },
    }),
    nextCookies(),
  ],
});

export type Auth = typeof auth;

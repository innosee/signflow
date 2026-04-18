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

if (!configuredUrl && process.env.NODE_ENV === "production") {
  throw new Error(
    "BETTER_AUTH_URL (or NEXT_PUBLIC_APP_URL) must be set in production — " +
      "otherwise Better Auth falls back to localhost and breaks Reset/Invite links.",
  );
}

const appUrl = configuredUrl ?? "http://localhost:3000";

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
    // auf das die Agency-UI über `emailVerified` prüft.
    onPasswordReset: async ({ user }) => {
      await db
        .update(schema.users)
        .set({ emailVerified: true })
        .where(eq(schema.users.id, user.id));
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 Tage
    updateAge: 60 * 60 * 24, // Session-Refresh alle 24h
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
      adminRoles: ["agency"],
      impersonationSessionDuration: 60 * 60, // 1h
      roles: { agency: adminAc, coach: userAc },
    }),
    nextCookies(),
  ],
});

export type Auth = typeof auth;

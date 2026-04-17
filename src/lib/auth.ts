import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import {
  adminAc,
  userAc,
} from "better-auth/plugins/admin/access";

import { db, schema } from "@/db";
import { sendResetPasswordEmail } from "@/lib/email";

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is not set");
}

const appUrl =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

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
        fieldName: "signature_url",
        input: false,
      },
      deletedAt: {
        type: "date",
        required: false,
        fieldName: "deleted_at",
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
        fieldName: "ban_reason",
        input: false,
      },
      banExpires: {
        type: "date",
        required: false,
        fieldName: "ban_expires",
        input: false,
      },
    },
  },

  session: {
    modelName: "authSession",
    additionalFields: {
      impersonatedBy: {
        type: "string",
        required: false,
        fieldName: "impersonated_by",
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

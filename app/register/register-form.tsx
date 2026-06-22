"use client";

import Link from "next/link";
import Script from "next/script";
import { useActionState, useEffect, useRef } from "react";

import { registerBildungstraeger, type RegisterState } from "./actions";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function RegisterForm() {
  const [state, action, pending] = useActionState<RegisterState, FormData>(
    registerBildungstraeger,
    undefined,
  );

  const timestampRef = useRef<HTMLInputElement>(null);

  // Min-Time-Check braucht einen client-gesetzten Timestamp. Per useEffect,
  // damit SSR/CSR keinen Hydration-Mismatch auf Date.now() haben. Bots ohne
  // JS bekommen kein Feld → Server-Check verwirft sie.
  useEffect(() => {
    if (timestampRef.current) {
      timestampRef.current.value = String(Date.now());
    }
  }, [state]);

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-6 py-8 text-center">
        <svg
          className="mx-auto h-10 w-10 text-emerald-600"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            d="M5 12l5 5 9-11"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h2 className="mt-4 text-lg font-semibold text-emerald-900">
          Fast geschafft — bestätige deine E-Mail.
        </h2>
        <p className="mt-2 text-sm text-emerald-800">
          Wir haben dir einen Link geschickt. Klick darauf, leg dein Passwort
          fest und du bist drin. Kein Link erhalten? Sieh im Spam-Ordner nach.
        </p>
      </div>
    );
  }

  const inputClass =
    "block w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black";

  return (
    <>
      <form action={action} className="space-y-4">
        <HoneypotField />
        <input
          ref={timestampRef}
          type="hidden"
          name="rendered_at"
          defaultValue=""
        />

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">
            Firma / Bildungsträger
            <span className="ml-0.5 text-red-600">*</span>
          </span>
          <input
            name="company"
            type="text"
            required
            autoComplete="organization"
            placeholder="Muster Bildungsträger GmbH"
            className={inputClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">
            Dein Name<span className="ml-0.5 text-red-600">*</span>
          </span>
          <input
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Vor- und Nachname"
            className={inputClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">
            E-Mail<span className="ml-0.5 text-red-600">*</span>
          </span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="du@bildungstraeger.de"
            className={inputClass}
          />
        </label>

        {TURNSTILE_SITE_KEY && (
          <div
            className="cf-turnstile"
            data-sitekey={TURNSTILE_SITE_KEY}
            data-theme="light"
            data-size="flexible"
          />
        )}

        {state?.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? "Wird angelegt…" : "Kostenlos registrieren"}
        </button>

        <p className="text-xs text-zinc-500">
          Mit der Registrierung legst du einen Bildungsträger-Account an. Du
          erhältst eine E-Mail zum Festlegen deines Passworts. 14 Tage kostenlos
          testen, keine Zahlungsdaten nötig.
        </p>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-600">
        Schon ein Konto?{" "}
        <Link href="/login" className="font-medium text-zinc-900 underline">
          Anmelden
        </Link>
      </p>

      {TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          async
          defer
        />
      )}
    </>
  );
}

/**
 * Honigtopf: für echte User unsichtbar (off-screen, aria-hidden, tabIndex=-1).
 * Bots, die alle Felder stumpf ausfüllen, schreiben hier rein → Server-Action
 * verwirft die Submission. Identisch zum Warteliste-Formular.
 */
function HoneypotField() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "-10000px",
        top: "auto",
        width: "1px",
        height: "1px",
        overflow: "hidden",
      }}
    >
      <label>
        Website (bitte leer lassen)
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </label>
    </div>
  );
}

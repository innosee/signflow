"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { TurnstileWidget } from "@/components/turnstile-widget";

import { registerBildungstraeger, type RegisterState } from "./actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState<RegisterState, FormData>(
    registerBildungstraeger,
    undefined,
  );

  // Controlled inputs: React 19 setzt ein `<form action>` nach jedem
  // Action-Durchlauf zurück — auch bei reinem Fehler-State. Uncontrolled
  // Felder würden dann geleert (Turnstile-Fehler → alles neu tippen). Mit
  // eigenem State bleiben die Eingaben über Fehler hinweg erhalten.
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Min-Time-Check braucht einen client-gesetzten Timestamp. MUSS controlled
  // sein: ein uncontrolled Feld (defaultValue + Ref) wird bei JEDEM Re-Render
  // der controlled Geschwister (= jeder Tastendruck) wieder auf den
  // defaultValue zurückgesetzt → Timestamp leer beim Submit → Server hält uns
  // fälschlich für einen No-JS-Bot. Per useEffect gesetzt (nicht im
  // useState-Initializer), damit SSR (leer) und erste CSR-Render kein
  // Hydration-Mismatch auf Date.now() bekommen. Bots ohne JS bekommen kein
  // Feld → Server-Check verwirft sie.
  const [renderedAt, setRenderedAt] = useState("");
  useEffect(() => {
    // Bewusst client-seitig per Effect gesetzt (nicht im useState-Initializer),
    // damit SSR (leer) und erste CSR-Render kein Hydration-Mismatch auf
    // Date.now() bekommen. Der eine Folge-Render ist gewollt und unkritisch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRenderedAt(String(Date.now()));
  }, []);

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
          type="hidden"
          name="rendered_at"
          value={renderedAt}
          readOnly
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
            value={company}
            onChange={(e) => setCompany(e.target.value)}
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
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <TurnstileWidget />

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

"use client";

import { useActionState } from "react";

import { submitWaitlist, type WaitlistState } from "@/lib/waitlist-action";

export function LandingWaitlist() {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(
    submitWaitlist,
    undefined,
  );

  return (
    <section
      id="waitlist"
      className="border-t border-zinc-200 bg-linear-to-b from-white to-zinc-100"
    >
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="mb-10 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Warteliste
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Bereit, Papier hinter euch zu lassen?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
            Trag dich ein — wir melden uns mit Zugangsdaten und einem
            persönlichen Onboarding-Termin. Keine Verpflichtung, kein
            Payment-Upfront.
          </p>
        </div>

        {state?.ok ? (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-6 py-10 text-center">
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
            <h3 className="mt-4 text-lg font-semibold text-emerald-900">
              Danke — wir melden uns.
            </h3>
            <p className="mt-2 text-sm text-emerald-800">
              Deine Anfrage ist eingegangen. Antwort kommt typisch innerhalb
              von 1–2 Werktagen an die angegebene E-Mail.
            </p>
          </div>
        ) : (
          <form
            action={action}
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                name="name"
                label="Dein Name"
                required
                autoComplete="name"
              />
              <Field
                name="email"
                label="E-Mail"
                type="email"
                required
                autoComplete="email"
              />
              <Field
                name="company"
                label="Firma / Agentur"
                required
                autoComplete="organization"
              />
              <Field
                name="coaches"
                label="Anzahl Coaches (ungefähr)"
                type="number"
                min={1}
                max={2000}
              />
            </div>

            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-medium text-zinc-800">
                Nachricht (optional)
              </span>
              <textarea
                name="message"
                rows={3}
                maxLength={2000}
                placeholder="Wie können wir dich unterstützen?"
                className="block w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              />
            </label>

            {state?.error && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {state.error}
              </p>
            )}

            <div className="mt-5 flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-zinc-500">
                Mit dem Absenden stimmst du zu, dass wir dich per E-Mail
                kontaktieren. Keine Werbung, keine Datenweitergabe.
              </p>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center justify-center rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
              >
                {pending ? "Wird gesendet…" : "Auf Warteliste setzen"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-800">
        {label}
        {props.required && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      <input
        {...props}
        className={`block w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black ${className ?? ""}`}
      />
    </label>
  );
}

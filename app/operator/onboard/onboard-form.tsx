"use client";

import { useActionState, useEffect, useRef } from "react";

import { onboardBildungstraeger, type OnboardFormState } from "./actions";

export function OnboardForm() {
  const [state, action, pending] = useActionState<OnboardFormState, FormData>(
    onboardBildungstraeger,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Nach Erfolg nur die Org-Felder leeren, das Secret aber stehen lassen —
    // der Operator legt meist mehrere Freigaben hintereinander an.
    if (state?.success) {
      const form = formRef.current;
      if (!form) return;
      form.querySelectorAll<HTMLInputElement>(
        'input[name="company"],input[name="name"],input[name="email"]',
      ).forEach((el) => {
        el.value = "";
      });
    }
  }, [state?.success]);

  const inputClass =
    "w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black";

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600">
          Operator-Secret
        </label>
        <input
          name="secret"
          type="password"
          autoComplete="off"
          placeholder="••••••••"
          required
          className={inputClass}
        />
      </div>

      <hr className="border-zinc-200" />

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600">
          Firma / Bildungsträger
        </label>
        <input
          name="company"
          type="text"
          placeholder="Muster Bildungsträger GmbH"
          required
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600">
          Name der Admin-Person
        </label>
        <input
          name="name"
          type="text"
          placeholder="Vor- und Nachname"
          required
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600">
          E-Mail der Admin-Person
        </label>
        <input
          name="email"
          type="email"
          placeholder="admin@bildungstraeger.de"
          required
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Wird angelegt…" : "Bildungsträger anlegen & einladen"}
      </button>

      {state?.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-green-700">{state.success}</p>
      )}
    </form>
  );
}

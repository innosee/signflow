"use client";

import { useActionState } from "react";

import { foundBildungstraeger, type FoundBtState } from "@/lib/tenant-actions";

export function FoundBtForm() {
  const [state, action, pending] = useActionState<FoundBtState, FormData>(
    foundBildungstraeger,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">
          Firma / Bildungsträger <span className="text-red-600">*</span>
        </span>
        <input
          name="company"
          type="text"
          required
          maxLength={200}
          autoComplete="organization"
          className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
        />
      </label>

      {state?.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Wird angelegt …" : "Bildungsträger gründen"}
      </button>
    </form>
  );
}

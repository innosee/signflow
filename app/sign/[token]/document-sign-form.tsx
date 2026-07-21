"use client";

import { useActionState } from "react";

import { submitDocumentSignature, type DocSignState } from "./actions";

export function DocumentSignForm({
  token,
  documentId,
}: {
  token: string;
  documentId: string;
}) {
  const [state, action, pending] = useActionState<DocSignState, FormData>(
    submitDocumentSignature,
    undefined,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="documentId" value={documentId} />
      <label className="flex items-start gap-2 text-sm">
        <input name="confirm" type="checkbox" required className="mt-0.5" />
        <span>Ich habe das Dokument gelesen und unterschreibe es.</span>
      </label>
      {state?.error && (
        <p className="text-xs text-red-700" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white transition enabled:hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Wird unterschrieben…" : "Unterschreiben"}
      </button>
    </form>
  );
}

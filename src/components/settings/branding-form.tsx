"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  clearBrandingLogoAction,
  updateBrandingAction,
  type SettingsFormState,
} from "@/lib/settings-actions";

export function BrandingForm({
  initialAddress,
  initialLogoUrl,
}: {
  initialAddress: string;
  initialLogoUrl: string | null;
}) {
  const router = useRouter();
  const [addressState, addressAction, addressPending] = useActionState<
    SettingsFormState,
    FormData
  >(updateBrandingAction, undefined);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [logoStatus, setLogoStatus] = useState<
    "idle" | "uploading" | "done" | "clearing"
  >("idle");
  const [logoError, setLogoError] = useState<string | null>(null);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    setLogoStatus("uploading");
    try {
      const fd = new FormData();
      fd.append("logo", file, file.name);
      const res = await fetch("/api/branding/logo", {
        method: "POST",
        body: fd,
      });
      const payload = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !payload.url) {
        throw new Error(payload.error ?? `Upload fehlgeschlagen (${res.status}).`);
      }
      setLogoStatus("done");
      router.refresh();
    } catch (err) {
      setLogoStatus("idle");
      setLogoError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleClearLogo() {
    if (!window.confirm("Logo wirklich entfernen? Das PDF nutzt dann den Text-Fallback.")) return;
    setLogoStatus("clearing");
    setLogoError(null);
    try {
      await clearBrandingLogoAction();
      setLogoStatus("idle");
      router.refresh();
    } catch (err) {
      setLogoStatus("idle");
      setLogoError(err instanceof Error ? err.message : "Konnte Logo nicht entfernen.");
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-zinc-900">PDF-Logo</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Erscheint oben rechts auf jedem BER-PDF. PNG, JPEG oder SVG, max.
            1 MB. Empfohlen sind transparente PNGs mit ~400 px Höhe.
          </p>
        </div>

        {initialLogoUrl ? (
          <div className="flex items-center gap-4 rounded-lg border border-zinc-300 bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={initialLogoUrl}
              alt="Aktuelles PDF-Logo"
              className="h-16 w-auto max-w-[160px] object-contain"
            />
            <div className="flex-1 text-xs text-zinc-500">
              Aktuelles Logo. Lade ein neues hoch, um es zu ersetzen, oder
              entferne es für den Text-Fallback.
            </div>
            <button
              type="button"
              onClick={handleClearLogo}
              disabled={logoStatus === "clearing"}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
            >
              {logoStatus === "clearing" ? "Wird entfernt…" : "Entfernen"}
            </button>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
            Kein Logo hinterlegt — der PDF-Header zeigt aktuell den
            Text-Fallback.
          </p>
        )}

        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={handleLogoChange}
              disabled={logoStatus === "uploading"}
              className="sr-only"
            />
            {logoStatus === "uploading"
              ? "Wird hochgeladen…"
              : initialLogoUrl
                ? "Logo ersetzen"
                : "Logo hochladen"}
          </label>
          {logoStatus === "done" && (
            <span className="text-xs text-emerald-700">✓ gespeichert</span>
          )}
        </div>
        {logoError && (
          <p role="alert" className="text-sm text-red-600">
            {logoError}
          </p>
        )}
      </section>

      <form action={addressAction} className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-zinc-900">PDF-Postanschrift</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Erscheint oben links auf jedem BER-PDF. Eine Zeile pro Eintrag.
            Leer lassen, um auf den Erango-Standard zurückzufallen.
          </p>
        </div>
        <textarea
          name="pdfAddress"
          rows={7}
          defaultValue={initialAddress}
          maxLength={600}
          placeholder={[
            "Ekkehardstraße 12b",
            "D-78224 Singen",
            "Tel. +49 (0) 7731 / 90 97 18 - 10",
            "avgs@erango.de",
            "www.erango.de",
          ].join("\n")}
          className="block w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 font-mono text-sm leading-relaxed outline-none focus:border-black"
        />
        {addressState?.ok ? (
          <p className="text-sm text-emerald-700" role="status">
            ✓ {addressState.message}
          </p>
        ) : addressState?.error ? (
          <p className="text-sm text-red-600" role="alert">
            {addressState.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={addressPending}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {addressPending ? "Wird gespeichert…" : "Adresse speichern"}
        </button>
      </form>
    </div>
  );
}

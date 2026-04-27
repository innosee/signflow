"use client";

import { useState } from "react";

import {
  CheckerProgress,
  type CheckerStep,
} from "@/components/checker/checker-progress";

type Phase = "idle" | "running" | "done";

const INITIAL_STEPS: CheckerStep[] = [
  {
    id: "vercel",
    label: "1. Server-Endpoint erreichbar",
    description:
      "Dein Browser holt einen kurzlebigen Token von signflow.coach. Wenn das schon scheitert, ist deine Internet-Verbindung oder dein Login das Problem.",
    state: "pending",
  },
  {
    id: "ionos",
    label: "2. Anonymisierungs-Server in Frankfurt erreichbar",
    description:
      "Test-Verbindung zum IONOS-Proxy. Hier scheitern die meisten Firmen-Rechner — Antivirus, Firewall oder DNS-Filter blockieren die Domain.",
    state: "pending",
  },
  {
    id: "roundtrip",
    label: "3. Anonymisierung funktioniert",
    description:
      "Voller Test-Roundtrip mit einem harmlosen Probe-Text. Wenn das grün wird, ist alles bereit.",
    state: "pending",
  },
];

const IT_MAIL_TEMPLATE = `Hallo IT-Team,

ich nutze die Software Signflow (https://signflow.coach). Eine Funktion
benötigt eine direkte HTTPS-Verbindung von meinem Browser zu einem
Anonymisierungs-Server in Frankfurt. Aktuell wird sie blockiert.

Bitte folgende Domain in Firewall, Antivirus/Endpoint-Protection sowie
DNS-Filter freigeben:

  Hostname:  anon.signflow.coach
  Port:      443 (HTTPS)
  Protokoll: TLS 1.2 oder höher, ausgehend

Falls TLS-Inspection ("SSL-Inspection", "HTTPS-Aufbruch") aktiv ist,
müsste die Domain zusätzlich von der Inspection ausgenommen werden —
der Browser erwartet die Original-Zertifikatskette zu Let's Encrypt /
ISRG Root.

Hintergrund: die Verbindung dient der Anonymisierung von Texten in
Frankfurt, bevor sie zur Prüfung weitergehen — ohne diese Freigabe
kann ich die Funktion nicht nutzen.

Vielen Dank!`;

type ProbeOutcome =
  | { state: "success"; detail: string; data?: unknown }
  | { state: "error"; detail: string; showItHelp?: boolean };

export function DiagnoseRunner() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<CheckerStep[]>(INITIAL_STEPS);
  const [showItHelp, setShowItHelp] = useState(false);

  function updateStep(id: string, patch: Partial<CheckerStep>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function runDiagnostics() {
    setPhase("running");
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, state: "pending" })));
    setShowItHelp(false);

    // ---- Probe 1: Vercel-Token-Endpoint ----
    updateStep("vercel", { state: "active" });
    const vercel = await probeVercelToken();
    updateStep("vercel", { state: vercel.state, detail: vercel.detail });
    if (vercel.state === "error") {
      updateStep("ionos", {
        state: "skipped",
        detail: "Übersprungen — ohne Server-Token kein weiterer Test möglich.",
      });
      updateStep("roundtrip", {
        state: "skipped",
        detail: "Übersprungen.",
      });
      if (vercel.showItHelp) setShowItHelp(true);
      setPhase("done");
      return;
    }

    const tokenData = vercel.data as
      | { token: string; proxyUrl: string }
      | undefined;
    if (!tokenData) {
      // 503 / Bypass — Server-Konfig fehlt, kein weiterer Test möglich.
      // Schritte 2 & 3 als "skipped" markieren, NICHT als Fehler — bei Dir
      // (im Browser) ist nichts kaputt.
      updateStep("ionos", {
        state: "skipped",
        detail:
          "Übersprungen — Server hat aktuell keine Anonymisierungs-Konfiguration. Das ist eine Server-Einstellung, kein Problem auf deiner Seite.",
      });
      updateStep("roundtrip", {
        state: "skipped",
        detail: "Übersprungen.",
      });
      setPhase("done");
      return;
    }

    // ---- Probe 2: IONOS /healthz ----
    updateStep("ionos", { state: "active" });
    const ionos = await probeIonosHealth(tokenData.proxyUrl);
    updateStep("ionos", { state: ionos.state, detail: ionos.detail });
    if (ionos.state === "error") {
      updateStep("roundtrip", {
        state: "skipped",
        detail: "Übersprungen — der Anonymisierungs-Server ist nicht erreichbar.",
      });
      if (ionos.showItHelp) setShowItHelp(true);
      setPhase("done");
      return;
    }

    // ---- Probe 3: End-to-End-Roundtrip ----
    updateStep("roundtrip", { state: "active" });
    const roundtrip = await probeRoundtrip(
      tokenData.proxyUrl,
      tokenData.token,
    );
    updateStep("roundtrip", {
      state: roundtrip.state,
      detail: roundtrip.detail,
    });
    setPhase("done");
  }

  const allGreen =
    phase === "done" && steps.every((s) => s.state === "success");
  const anyRed = phase === "done" && steps.some((s) => s.state === "error");
  const anySkipped =
    phase === "done" && steps.some((s) => s.state === "skipped");
  const onlyConfigMissing = phase === "done" && !anyRed && anySkipped;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={runDiagnostics}
          disabled={phase === "running"}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase === "running"
            ? "läuft …"
            : phase === "done"
              ? "Erneut testen"
              : "Verbindung jetzt testen"}
        </button>
        {phase === "done" && allGreen && (
          <span className="text-sm font-medium text-emerald-700">
            Alles grün — der Checker funktioniert auf diesem Rechner.
          </span>
        )}
        {phase === "done" && anyRed && (
          <span className="text-sm font-medium text-rose-700">
            Eine oder mehrere Verbindungen blockiert — siehe unten.
          </span>
        )}
        {phase === "done" && onlyConfigMissing && (
          <span className="text-sm font-medium text-amber-700">
            Server-Anonymisierung ist nicht konfiguriert — bitte den Anbieter
            kontaktieren. Auf deiner Seite ist nichts blockiert.
          </span>
        )}
      </div>

      {phase !== "idle" && <CheckerProgress steps={steps} />}

      {showItHelp && <ItMailHelp />}

      {phase === "done" && allGreen && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900">
          Du kannst den Checker uneingeschränkt nutzen.{" "}
          <a
            href="/coach/checker"
            className="underline underline-offset-2 hover:no-underline"
          >
            Zurück zum Checker →
          </a>
        </div>
      )}
    </div>
  );
}

function ItMailHelp() {
  const [copied, setCopied] = useState(false);
  const subject = "Bitte signflow.coach in Firewall/AV freigeben";
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(IT_MAIL_TEMPLATE)}`;

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(IT_MAIL_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard verweigert (z.B. kein HTTPS) — Fallback: User markiert manuell
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/60 p-5">
      <div>
        <h2 className="text-sm font-semibold text-amber-900">
          Wahrscheinlichste Ursache: dein Firmen-Netzwerk blockiert die Verbindung
        </h2>
        <p className="mt-1 text-xs text-amber-800">
          Das liegt fast nie an Signflow selbst, sondern an Antivirus mit
          TLS-Inspection, einer Corporate-Firewall oder einem DNS-Filter. Bitte
          deine IT, die Domain <code>anon.signflow.coach</code> freizugeben —
          unten findest du eine fertige E-Mail-Vorlage.
        </p>
      </div>

      <pre className="overflow-x-auto rounded-lg border border-amber-200 bg-white p-3 text-xs text-zinc-800 whitespace-pre-wrap">
        {IT_MAIL_TEMPLATE}
      </pre>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyTemplate}
          className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          {copied ? "kopiert ✓" : "Text kopieren"}
        </button>
        <a
          href={mailto}
          className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          E-Mail vorbereiten →
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

async function probeVercelToken(): Promise<ProbeOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/checker/anonymize-token", {
      method: "GET",
      cache: "no-store",
    });
  } catch (err) {
    return {
      state: "error",
      detail: `Browser kann signflow.coach nicht erreichen: ${err instanceof Error ? err.message : String(err)}. Prüfe deine Internet-Verbindung.`,
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      state: "error",
      detail:
        "Sitzung ungültig oder du bist nicht als Coach angemeldet. Bitte neu einloggen und nochmal versuchen.",
    };
  }
  if (res.status === 503) {
    // Proxy serverseitig nicht konfiguriert — kein User-Problem.
    return {
      state: "success",
      detail:
        "Server-Endpoint erreichbar. Hinweis: Anonymisierung ist serverseitig (noch) nicht aktiv (Konfiguration fehlt) — die folgenden Tests werden übersprungen.",
      data: undefined,
    };
  }
  if (!res.ok) {
    return {
      state: "error",
      detail: `Server-Endpoint antwortet mit HTTP ${res.status}.`,
    };
  }

  let data: { token?: string; proxyUrl?: string };
  try {
    data = (await res.json()) as { token?: string; proxyUrl?: string };
  } catch {
    return {
      state: "error",
      detail: "Server-Antwort war kein gültiges JSON.",
    };
  }
  if (!data.token || !data.proxyUrl) {
    return {
      state: "error",
      detail: "Server-Antwort unvollständig (Token oder Proxy-URL fehlt).",
    };
  }

  return {
    state: "success",
    detail: `Token erhalten, Anonymisierungs-Server: ${data.proxyUrl}`,
    data: { token: data.token, proxyUrl: data.proxyUrl },
  };
}

async function probeIonosHealth(proxyUrl: string): Promise<ProbeOutcome> {
  let res: Response;
  try {
    res = await fetch(`${proxyUrl}/healthz`, {
      method: "GET",
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      state: "error",
      detail: `Browser kann ${proxyUrl} nicht erreichen: ${msg}`,
      showItHelp: true,
    };
  }
  if (!res.ok) {
    return {
      state: "error",
      detail: `Anonymisierungs-Server antwortet mit HTTP ${res.status}.`,
    };
  }
  let data: { ok?: boolean };
  try {
    data = (await res.json()) as { ok?: boolean };
  } catch {
    return {
      state: "error",
      detail: "Antwort war kein gültiges JSON — vermutlich ein Proxy/Captive-Portal dazwischen.",
      showItHelp: true,
    };
  }
  if (!data.ok) {
    return {
      state: "error",
      detail: "Server erreichbar, meldet aber keinen ok-Status.",
    };
  }
  return {
    state: "success",
    detail: "Verbindung steht, Server gesund.",
  };
}

async function probeRoundtrip(
  proxyUrl: string,
  token: string,
): Promise<ProbeOutcome> {
  const probeText = "Anna Müller war heute pünktlich.";
  let res: Response;
  try {
    res = await fetch(`${proxyUrl}/v1/anonymize`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sections: { teilnahme: probeText, ablauf: "", fazit: "" },
      }),
    });
  } catch (err) {
    return {
      state: "error",
      detail: `Roundtrip fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (res.status === 401) {
    return {
      state: "error",
      detail:
        "Token wurde vom Anonymisierungs-Server abgelehnt — Server-Konfiguration stimmt nicht überein. Das ist kein Problem auf deiner Seite, bitte den Anbieter kontaktieren.",
    };
  }
  if (!res.ok) {
    return {
      state: "error",
      detail: `Roundtrip antwortet mit HTTP ${res.status}.`,
    };
  }
  return {
    state: "success",
    detail: "Anonymisierungs-Roundtrip erfolgreich — Pipeline einsatzbereit.",
  };
}

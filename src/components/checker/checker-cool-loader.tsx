"use client";

import { useEffect, useRef, useState } from "react";

type Stage = "anon" | "azure";

/**
 * Pseudo-Operationen pro Stage. Werden im Sekundentakt durchrotiert, damit
 * der Loader wirkt wie ein laufendes Analyse-Werkzeug (Cockpit-Vibe). Die
 * Texte sind plausibel-fachlich aber nicht 1:1 echte Logs — der Browser
 * macht zwar tatsächlich Tokenisierung + TLS-Handshake, aber nicht in
 * dieser Granularität.
 */
const ANON_LOG = [
  "tokenize → splitting on UAX#29 word boundaries",
  "load NER model · GLiNER-large-de (ENV=eu-fra)",
  "span detected · type=NAME conf=0.94",
  "pseudonymize · [NAME_1] → [NAME_1]",
  "build reverse-map lookup table",
  "sliding context window over §teilnahme",
  "span detected · type=DATUM conf=0.98",
  "pseudonymize · [DATUM_3]",
  "span detected · type=ORG conf=0.91",
  "tlsv1.3 handshake · anon.signflow.coach:443",
  "stream payload · zstd lvl=6",
  "verify hmac · sha256(token, secret)",
];

const AZURE_LOG = [
  "stream tokens → azure-eu (sweden-central)",
  "load rule catalog · 147 hard_block patterns",
  "evaluate clause · diagnose.medizin",
  "score tonality · cos-sim, 384-dim vector",
  "match §ablauf vs must-have:profiling",
  "probe konkretheit · bewerbungen_konkret",
  "sample at T=0 · seed=42 (deterministic)",
  "verify quote-fidelity · 1:1 substring check",
  "build suggestion candidates",
  "verify suggestion ↛ neue regelverstöße",
  "compose finding payload",
  "validate against output schema",
];

/**
 * „Mission-Control"-Loader für den Bericht-Checker. Ersetzt den schlichten
 * RunningIndicator durch einen animierten Cockpit-Block mit Waveform,
 * Pipeline-Visualisierung, mitlaufenden Metriken und rotierendem Log.
 *
 * Bewusst dark-theme als Akzent zur restlichen hellen UI — soll wie ein
 * angedocktes Analyse-Werkzeug wirken, nicht wie eine generische Spinner-
 * Karte. Komponente ist selbst-tickend (kein externes State-Mgmt), Timer
 * werden im useEffect-Cleanup abgeräumt.
 */
export function CheckerCoolLoader({ stage }: { stage: Stage }) {
  const [tick, setTick] = useState(0);
  const [tokens, setTokens] = useState(0);
  const [entities, setEntities] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [logCursor, setLogCursor] = useState(0);
  // Start-Zeitpunkt wird im Effect gesetzt — `Date.now()` direkt in der
  // Render-Phase verstößt gegen die React-Purity-Regel.
  const t0Ref = useRef<number | null>(null);

  useEffect(() => {
    t0Ref.current = Date.now();
    // Schneller Tick (~16 fps) für Wave + Pipeline-Particle.
    const fast = window.setInterval(() => setTick((t) => t + 1), 60);
    // Langsamer Tick für Log-Rotation + Counter — soll les-/erfassbar sein.
    const slow = window.setInterval(() => {
      const t0 = t0Ref.current ?? Date.now();
      setElapsedMs(Date.now() - t0);
      setTokens((p) => p + Math.floor(40 + Math.random() * 120));
      setEntities((p) => p + (Math.random() < 0.28 ? 1 : 0));
      setLogCursor((l) => l + 1);
    }, 320);
    return () => {
      window.clearInterval(fast);
      window.clearInterval(slow);
    };
  }, []);

  const pool = stage === "anon" ? ANON_LOG : AZURE_LOG;
  const visibleLines = [0, 1, 2].map((i) => pool[(logCursor + i) % pool.length]);

  // Zwei überlagerte Sinuswellen für etwas Bewegung — geometrisch genug,
  // dass das Auge eine Schwingung wahrnimmt, aber kein dauerhaft heftiges
  // Flimmern (Wellen-Amplitude bewusst klein).
  const wavePoints = Array.from({ length: 60 }, (_, i) => {
    const x = i * 4;
    const y =
      18 +
      Math.sin((tick + i) * 0.35) * 7 +
      Math.cos((tick * 0.6 + i) * 0.18) * 4;
    return `${x},${y.toFixed(2)}`;
  }).join(" ");

  const elapsedStr = (elapsedMs / 1000).toFixed(1).padStart(5, "0");
  const stageLabel = stage === "anon" ? "1/2 · ANON" : "2/2 · RULES";

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-200 shadow-[0_10px_40px_-10px_rgba(34,211,238,0.25)]">
      {/* Title-Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
            analysis in progress
          </span>
        </div>
        <span className="text-[10px] tabular-nums text-zinc-500">
          T+{elapsedStr}s
        </span>
      </div>

      <div className="space-y-4 p-4">
        {/* Pipeline */}
        <div className="flex items-center gap-1.5 text-[9px]">
          <PipelineNode label="BROWSER" state="done" />
          <PipelineArrow tick={tick} active={stage === "anon"} />
          <PipelineNode
            label="IONOS·FRA"
            state={
              stage === "anon" ? "active" : stage === "azure" ? "done" : "idle"
            }
          />
          <PipelineArrow tick={tick} active={stage === "azure"} />
          <PipelineNode
            label="AZURE·SWE"
            state={stage === "azure" ? "active" : "idle"}
          />
        </div>

        {/* Waveform-Strip */}
        <div className="overflow-hidden rounded-md border border-zinc-800 bg-black/40 p-2">
          <svg
            viewBox="0 0 240 36"
            preserveAspectRatio="none"
            className="block h-9 w-full"
            aria-hidden
          >
            <defs>
              <linearGradient id="cool-loader-wave" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            {[9, 18, 27].map((y) => (
              <line
                key={y}
                x1="0"
                x2="240"
                y1={y}
                y2={y}
                stroke="#1f2937"
                strokeWidth="0.5"
                strokeDasharray="2 3"
              />
            ))}
            <polyline
              points={wavePoints}
              fill="none"
              stroke="url(#cool-loader-wave)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <Metric label="TOKENS" value={tokens.toLocaleString("de-DE")} />
          <Metric label="ENTITIES" value={String(entities).padStart(2, "0")} />
          <Metric label="STAGE" value={stageLabel} accent />
        </div>

        {/* Log-Stream — newest line top, in cyan. */}
        <div className="space-y-1 text-[11px] leading-tight">
          {visibleLines.map((line, i) => (
            <p
              key={`${logCursor}-${i}`}
              className={
                i === 0
                  ? "text-cyan-300"
                  : i === 1
                    ? "text-zinc-400"
                    : "text-zinc-600"
              }
            >
              <span className="text-zinc-700">$&gt;</span> {line}
            </p>
          ))}
        </div>

        {/* Trust-Footer — bewusst klein, kein lautes Disclaimer-Banner */}
        <p className="border-t border-zinc-800 pt-3 text-[10px] leading-relaxed text-zinc-500">
          Klartext bleibt im Browser. Pseudonymisierter Text fließt
          ausschließlich über anon.signflow.coach (Frankfurt) und Azure
          OpenAI EU (Sweden Central). Kein Roh-PII auf US-Servern.
        </p>
      </div>
    </div>
  );
}

function PipelineNode({
  label,
  state,
}: {
  label: string;
  state: "idle" | "active" | "done";
}) {
  const styles =
    state === "active"
      ? "border-cyan-400/70 bg-cyan-950/40 text-cyan-200 shadow-[0_0_14px_-2px_rgba(34,211,238,0.55)]"
      : state === "done"
        ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-300/85"
        : "border-zinc-800 bg-zinc-950 text-zinc-500";
  return (
    <div
      className={`flex-1 rounded border px-2 py-1.5 text-center font-semibold uppercase tracking-[0.18em] transition-colors ${styles}`}
    >
      {label}
    </div>
  );
}

function PipelineArrow({ tick, active }: { tick: number; active: boolean }) {
  // 36px Bahn, 12px breiter „Comet" — wandert in 36-er Schritten durch.
  const offset = ((tick * 6) % 48) - 12;
  return (
    <div className="relative h-1 w-7 overflow-hidden rounded-full bg-zinc-800">
      {active && (
        <div
          className="absolute top-0 h-full w-3 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
          style={{ transform: `translateX(${offset}px)` }}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-2 py-1.5 ${accent ? "border-cyan-400/40 bg-cyan-950/20" : "border-zinc-800 bg-black/30"}`}
    >
      <span className="block text-[9px] uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </span>
      <span
        className={`mt-0.5 block text-sm font-semibold tabular-nums ${accent ? "text-cyan-200" : "text-zinc-100"}`}
      >
        {value}
      </span>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi! Ich helfe dir bei der Bedienung von Signflow — frag mich z. B. „Wie lege ich einen Termin an?“. Komme ich nicht weiter, klick unten auf „Mensch kontaktieren“.",
};

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Eskalation
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [note, setNote] = useState("");
  const [escalateState, setEscalateState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [escalateError, setEscalateError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open, loading]);

  // Nur die echten Dialog-Nachrichten an den Server schicken (ohne das
  // clientseitige Begrüßungs-Intro).
  function dialogOnly(list: ChatMessage[]): ChatMessage[] {
    return list.filter((m) => m !== GREETING);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/coach/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: dialogOnly(next) }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        throw new Error(data.error ?? "Unbekannter Fehler");
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply! }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Etwas ist schiefgelaufen.");
    } finally {
      setLoading(false);
    }
  }

  async function escalate() {
    setEscalateState("sending");
    setEscalateError(null);
    const dialog = dialogOnly(messages);
    // Wenn noch kein Dialog existiert, wird die Notiz selbst zur Nachricht —
    // so kann ein Coach auch ohne Chat direkt um Kontakt bitten.
    const payloadMessages: ChatMessage[] =
      dialog.length > 0
        ? dialog
        : [{ role: "user", content: note.trim() || "Bitte um Kontakt." }];
    try {
      const res = await fetch("/api/coach/support/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payloadMessages,
          note: note.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Unbekannter Fehler");
      }
      setEscalateState("sent");
    } catch (err) {
      setEscalateState("error");
      setEscalateError(
        err instanceof Error ? err.message : "Etwas ist schiefgelaufen.",
      );
    }
  }

  return (
    <div className="print:hidden">
      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-128 max-h-[calc(100vh-7rem)] w-88 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-zinc-300 bg-white shadow-xl">
          <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900">Support</p>
              <p className="text-[11px] text-zinc-500">
                Hilfe zur Bedienung von Signflow
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Schließen"
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-[11px] leading-snug text-amber-800">
            Datenschutz: Bitte keine Klarnamen, Kunden- oder Telefonnummern von
            Teilnehmern eingeben.
          </p>

          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user" ? "flex justify-end" : "flex justify-start"
                }
              >
                <div
                  className={
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm " +
                    (m.role === "user"
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-800")
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-zinc-100 px-3 py-2 text-sm text-zinc-400">
                  …
                </div>
              </div>
            )}
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}
          </div>

          {/* Eskalation */}
          {escalateOpen ? (
            <div className="border-t border-zinc-200 px-4 py-3">
              {escalateState === "sent" ? (
                <p className="text-sm text-emerald-700">
                  Danke! Deine Anfrage ist raus — das Team meldet sich per
                  E-Mail.
                </p>
              ) : (
                <>
                  <label className="text-xs font-medium text-zinc-600">
                    Kurz beschreiben (optional)
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Woran hängt's? Dein Gesprächsverlauf wird mitgeschickt."
                    className="mt-1 block w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                  {escalateError && (
                    <p className="mt-1 text-xs text-red-700">{escalateError}</p>
                  )}
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEscalateOpen(false)}
                      className="rounded-lg px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
                    >
                      Zurück
                    </button>
                    <button
                      type="button"
                      onClick={escalate}
                      disabled={escalateState === "sending"}
                      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white enabled:hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {escalateState === "sending" ? "Senden…" : "Absenden"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="border-t border-zinc-200 px-3 py-2">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder="Frage eingeben…"
                  className="max-h-28 flex-1 resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={loading || input.trim().length === 0}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white enabled:hover:bg-zinc-800 disabled:opacity-50"
                >
                  Senden
                </button>
              </div>
              <button
                type="button"
                onClick={() => setEscalateOpen(true)}
                className="mt-2 text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
              >
                Komme nicht weiter — Mensch kontaktieren
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating-Button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Support schließen" : "Support öffnen"}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition hover:bg-zinc-800"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
          </svg>
        )}
      </button>
    </div>
  );
}

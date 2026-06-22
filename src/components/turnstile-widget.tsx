"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Cloudflare-Turnstile-Widget mit EXPLIZITEM Rendering.
 *
 * Warum nicht der einfache `class="cf-turnstile"`-Weg (implizites Auto-Render)?
 * Turnstile scannt nur EINMAL beim Script-Load nach `.cf-turnstile`-Elementen.
 * Bei einer Client-Navigation (z. B. Landing → /register über next/link) wird
 * `api.js` nicht neu geladen (next/script dedupt nach src), also rendert das
 * frisch gemountete Widget erst nach einem harten Reload. Mit explizitem
 * `turnstile.render()` im Effect rendern wir selbst — funktioniert bei Soft-Nav
 * UND bei Direktaufruf.
 *
 * Das Widget injiziert ein verstecktes `<input name="cf-turnstile-response">`
 * in den Container; deshalb muss `<TurnstileWidget>` INNERHALB des <form> stehen,
 * damit der Token mitgeschickt wird (Server liest `TURNSTILE_FIELD`).
 */
export function TurnstileWidget({
  theme = "light",
  size = "flexible",
  className,
}: {
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact" | "flexible";
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    let pollId: number | undefined;

    const renderWidget = () => {
      if (
        cancelled ||
        !containerRef.current ||
        !window.turnstile ||
        widgetIdRef.current !== null
      ) {
        return;
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        theme,
        size,
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      // Script noch nicht da (erster Direktaufruf): warten bis `turnstile`
      // global verfügbar ist, dann rendern.
      pollId = window.setInterval(() => {
        if (window.turnstile) {
          if (pollId) window.clearInterval(pollId);
          renderWidget();
        }
      }, 100);
    }

    return () => {
      cancelled = true;
      if (pollId) window.clearInterval(pollId);
      if (window.turnstile && widgetIdRef.current !== null) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Widget evtl. schon entfernt — egal.
        }
        widgetIdRef.current = null;
      }
    };
  }, [theme, size]);

  if (!SITE_KEY) return null;

  return (
    <>
      <div ref={containerRef} className={className} />
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
    </>
  );
}

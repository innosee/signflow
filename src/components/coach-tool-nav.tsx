"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ToolKey = "sign" | "check";

type Tool = {
  key: ToolKey;
  label: string;
  /** Landing-URL beim Wechsel zu diesem Tool. */
  href: string;
  /**
   * URL-Prefixe, die als „dieses Tool ist aktiv" zählen. Reihenfolge
   * spielt eine Rolle — der erste passende Treffer gewinnt, deshalb
   * spezifischere Prefixes zuerst.
   */
  pathPrefixes: string[];
  /** Tool-spezifische Sub-Nav unter dem Switcher. */
  navLinks: { href: string; label: string }[];
};

const SIGN_TOOL: Tool = {
  key: "sign",
  label: "Signatur",
  href: "/coach",
  pathPrefixes: ["/coach/courses", "/coach/signature"],
  navLinks: [{ href: "/coach", label: "Meine Kurse" }],
};

const CHECK_TOOL: Tool = {
  key: "check",
  label: "Berichts-Checker",
  href: "/coach/checker",
  pathPrefixes: ["/coach/checker", "/coach/abschlussberichte"],
  navLinks: [
    { href: "/coach/checker", label: "Überblick" },
    { href: "/coach/checker/check", label: "Schnell-Check" },
  ],
};

/**
 * Aktives Tool aus dem Pfad ableiten. `/coach` (exact) gilt als Sign-
 * Tool-Landing — Prefix-Matching würde sonst alle Coach-Routen treffen.
 * Settings (`/coach/settings`) ist tool-übergreifend und bleibt deshalb
 * beim zuletzt gewählten Tool im jeweiligen Rendering hängen; der
 * Switcher zeigt für /settings das Sign-Tool als aktiv (Default).
 */
function detectTool(pathname: string, tools: Tool[]): Tool {
  for (const t of tools) {
    if (pathname === t.href) return t;
    if (t.pathPrefixes.some((p) => pathname.startsWith(p))) return t;
  }
  return tools[0]!;
}

const ACCENT = {
  sign: {
    active: "bg-zinc-900 text-white",
    inactive: "text-zinc-700 hover:bg-zinc-100",
    strip: "bg-zinc-900",
    navActive: "text-zinc-950 font-medium",
    navHover: "hover:text-zinc-950",
  },
  check: {
    active: "bg-indigo-600 text-white",
    inactive: "text-zinc-700 hover:bg-zinc-100",
    strip: "bg-indigo-600",
    navActive: "text-indigo-700 font-medium",
    navHover: "hover:text-indigo-700",
  },
} as const;

export function CoachToolNav({ signingEnabled }: { signingEnabled: boolean }) {
  const pathname = usePathname() ?? "/coach";
  const tools: Tool[] = signingEnabled ? [SIGN_TOOL, CHECK_TOOL] : [CHECK_TOOL];
  const active = detectTool(pathname, tools);
  const accent = ACCENT[active.key];

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3">
        {/* Tool-Switcher: nur wenn mehr als ein Tool sichtbar ist — Coaches
            ohne signing_enabled sehen direkt den Checker-Nav ohne Switcher. */}
        {tools.length > 1 && (
          <div
            role="tablist"
            aria-label="Tool-Auswahl"
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white p-1 text-sm"
          >
            {tools.map((t) => {
              const isActive = t.key === active.key;
              return (
                <Link
                  key={t.key}
                  href={t.href}
                  role="tab"
                  aria-selected={isActive}
                  className={`rounded-md px-3 py-1.5 transition ${
                    isActive
                      ? ACCENT[t.key].active
                      : ACCENT[t.key].inactive
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        )}

        <nav
          aria-label={`${active.label}-Navigation`}
          className="flex items-center gap-4 text-sm"
        >
          {active.navLinks.map((l) => {
            const isCurrent =
              pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isCurrent ? "page" : undefined}
                className={`text-zinc-700 underline-offset-4 hover:underline ${
                  isCurrent ? accent.navActive : accent.navHover
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Accent-Strip: dünner Farbstreifen, der dem User auf einen Blick
          zeigt welches Tool aktiv ist. Bewusst dezent (1px), kein
          aufdringliches Banner. Wird im AppHeader als ::after-Pendant
          gerendert — hier nur als visueller Anker innerhalb des Nav-
          Containers nicht nötig, der Strip kommt aus dem Layout-Wrapper. */}
    </div>
  );
}

/**
 * Reine Anzeige-Komponente — rendert das Tool-Label als Brand-Subtext.
 * Wird neben „Signflow" im AppHeader gerendert. Liest pathname, damit's
 * mit der Switcher-Auswahl synchron bleibt.
 */
export function CoachToolSubBrand({
  signingEnabled,
}: {
  signingEnabled: boolean;
}) {
  const pathname = usePathname() ?? "/coach";
  const tools: Tool[] = signingEnabled ? [SIGN_TOOL, CHECK_TOOL] : [CHECK_TOOL];
  const active = detectTool(pathname, tools);
  return (
    <span
      className={`hidden text-sm text-zinc-500 sm:inline ${
        active.key === "check" ? "text-indigo-700" : ""
      }`}
    >
      · {active.label}
    </span>
  );
}

/**
 * Schmaler Accent-Strip unter dem Header. Tool-Farbe ist über
 * pathname abgeleitet — synchron mit Switcher und SubBrand.
 */
export function CoachToolAccentStrip({
  signingEnabled,
}: {
  signingEnabled: boolean;
}) {
  const pathname = usePathname() ?? "/coach";
  const tools: Tool[] = signingEnabled ? [SIGN_TOOL, CHECK_TOOL] : [CHECK_TOOL];
  const active = detectTool(pathname, tools);
  return <div className={`h-0.5 ${ACCENT[active.key].strip}`} />;
}

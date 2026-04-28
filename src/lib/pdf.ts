import "server-only";

import chromium from "@sparticuz/chromium";
import type { Browser } from "puppeteer-core";
import puppeteer from "puppeteer-core";

export type PdfCookie = {
  name: string;
  value: string;
  domain: string;
  path?: string;
};

/**
 * Lädt die aktuelle Stundennachweis-Seite headless und erzeugt daraus ein
 * A4-PDF. Auth läuft über mitgeschickte Cookies — der Headless-Browser ruft
 * unsere eigene Print-Route auf und unterliegt denselben DAL-Checks wie der
 * Coach im Browser.
 *
 * Läuft sowohl lokal (mit Mac-System-Chrome, falls
 * `PUPPETEER_EXECUTABLE_PATH` gesetzt ist) als auch auf Vercel Serverless
 * (über den Lambda-optimierten `@sparticuz/chromium`-Build).
 */
export async function renderPdfFromUrl(
  url: string,
  cookies: PdfCookie[],
): Promise<Uint8Array> {
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ??
    (await chromium.executablePath());

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, "--hide-scrollbars"],
      executablePath,
      headless: true,
      // Viewport ist für die PDF-Ausgabe irrelevant (page.pdf() nutzt
      // @page/A4 unabhängig davon), aber ein sinnvoller Default
      // verhindert, dass responsive-CSS im print-Modus auf 0×0 rechnet.
      defaultViewport: { width: 1200, height: 1600 },
    });

    const page = await browser.newPage();
    if (cookies.length > 0) {
      // Cookie-Mapping mit Prefix-Awareness:
      //
      //   __Host-* darf laut RFC 6265bis KEIN domain-Attribut haben (nur
      //   path=/ + secure=true). Better-auth verwendet diese Variante auf
      //   HTTPS-Production. Mit domain-Attribut lehnt Puppeteer/CDP den
      //   Cookie ab → "Protocol error (Network.setCookies): Invalid cookie
      //   fields".
      //
      //   __Secure-* erlaubt domain, braucht aber secure=true.
      //
      //   Auf HTTPS-URLs (Production) erzwingen wir secure=true für alle
      //   Cookies — sonst stuft Chrome SameSite=None-Cookies als ungültig
      //   ein und das Forwarding bricht silently weg.
      const isHttps = url.startsWith("https://");
      await page.setCookie(
        ...cookies.map((c) => {
          const isHostPrefix = c.name.startsWith("__Host-");
          const needsSecure =
            isHostPrefix || c.name.startsWith("__Secure-") || isHttps;
          return {
            name: c.name,
            value: c.value,
            // __Host- darf kein domain — wir lassen das Feld weg.
            ...(isHostPrefix ? {} : { domain: c.domain }),
            path: c.path ?? "/",
            ...(needsSecure ? { secure: true } : {}),
          };
        }),
      );
    }

    // `networkidle0` wartet, bis 500 ms lang keine offene Netzwerk-Anfrage
    // mehr läuft — sicher genug, dass Signatur-PNGs aus dem Blob-Store
    // nachgeladen sind, bevor wir das PDF rendern.
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });
    return pdf;
  } finally {
    if (browser) {
      await browser.close().catch(() => {
        // Browser-Cleanup darf das API-Response nicht blockieren.
      });
    }
  }
}

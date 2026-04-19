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
      await page.setCookie(
        ...cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path ?? "/",
        })),
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

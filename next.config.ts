import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF-Routen brauchen die @sparticuz/chromium-Binary auf der Vercel-
  // Lambda-FS. Next.js externalisiert das Package zwar (steht in der
  // serverExternalPackages-Default-Liste), aber das `bin/`-Verzeichnis mit
  // dem eigentlichen Headless-Chromium-Brotli-Tarball wird per Default
  // nicht in den Lambda-File-Trace aufgenommen — Folge: ENOENT auf
  // /var/task/node_modules/@sparticuz/chromium/bin beim Launch.
  // Wir tracen die kompletten Package-Files explizit für alle PDF-Routes.
  outputFileTracingIncludes: {
    "/api/**/pdf": ["./node_modules/@sparticuz/chromium/**/*"],
  },
  // Sicherheits-Header auf allen Antworten. Bewusst (noch) OHNE volle CSP:
  // eine zu strikte content-security-policy würde vor Launch Turnstile,
  // inline-Styles/-Scripts (Next.js) und die signature_pad-Canvas-Seite
  // brechen. Die hier gesetzten Header sind risikolos und decken die
  // wichtigsten Vektoren ab — insbesondere X-Frame-Options gegen Clickjacking
  // der rechtsverbindlichen Sign-/Freigabe-Seiten. CSP ist ein Follow-up.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

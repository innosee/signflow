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
};

export default nextConfig;

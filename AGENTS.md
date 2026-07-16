# ⚠️ Vor jedem Push: Release-Manifest lesen

`main` = `signflow.coach` = **100+ echte User mit echten AfA-Daten.** Jede
Änderung folgt **[DEVELOPMENT.md](DEVELOPMENT.md)**: Feature-Branch → Staging
verifizieren → PR nach `main` → Prod. **Nie** direkt auf `main`, **nie** auf der
Prod-DB schreiben/migrieren ohne Backup + User-OK. Pre-Push-Checkliste in
DEVELOPMENT.md §4. Staging-How-to: [STAGING.md](STAGING.md). Backups:
[docs/backups.md](docs/backups.md).

# Formulare mit Server-Actions

Jedes `<form action={serverAction}>` muss die Eingaben **bei Fehler behalten**
(React 19 resettet das Form sonst → getippter Text weg). Verbindliches Muster:
**[docs/forms-server-actions.md](docs/forms-server-actions.md)** (controlled
State oder Werte-Echo via `defaultValue`). Nie uncontrolled ohne `defaultValue`.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

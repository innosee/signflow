# signflow-anon-proxy

Pseudonymisierungs-Proxy für den Abschlussbericht-Checker. Läuft isoliert auf einer IONOS-Cloud-VM in Berlin (`de/txl`). Nimmt Rohberichte entgegen, liefert anonymisierte Fassung + Platzhalter-Mapping zurück. Rohtext verlässt diese VM nicht.

## Architektur

```
Coach-Browser ──HTTPS──► anon.signflow.coach (Caddy, IONOS-VM)
                                 │
                                 ▼
                           Node-Proxy (Port 3000)
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
   Stage 1: Regex        Stage 2: GLiNER           Stage 3: Llama 3.3 70B
   (deterministisch)     (Python-Subprocess,        (IONOS AI Hub, Residual)
                         MIT-Lizenz, lokal)
```

## Deployment auf die VM

Einmalige Vorbereitung als `root` auf der VM:

```bash
# non-root User
adduser --disabled-password --gecos "" signflow
usermod -aG sudo signflow
mkdir -p /home/signflow/.ssh /home/signflow/app
cp /root/.ssh/authorized_keys /home/signflow/.ssh/
chown -R signflow:signflow /home/signflow/.ssh /home/signflow/app
chmod 700 /home/signflow/.ssh

# sudoers: signflow darf den Service ohne Passwort restarten
echo 'signflow ALL=(root) NOPASSWD: /bin/systemctl restart anon-proxy, /bin/systemctl status anon-proxy' \
  > /etc/sudoers.d/signflow

# Python-venv vorbereiten
su - signflow -c "python3 -m venv /home/signflow/app/python/.venv"
su - signflow -c "/home/signflow/app/python/.venv/bin/pip install --upgrade pip"
```

Anschließend von deinem Mac aus:

```bash
./deploy.sh
```

Das synct den Ordner, installiert npm-Deps und startet den Service neu.

Python-Deps (GLiNER + Torch, ca. 2 GB) separat auf der VM installieren:

```bash
su - signflow -c "/home/signflow/app/python/.venv/bin/pip install -r /home/signflow/app/python/requirements.txt"
```

systemd + Caddy einmalig installieren:

```bash
cp /home/signflow/app/systemd/anon-proxy.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now anon-proxy

cp /home/signflow/app/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

## .env

Kopie von `.env.example` nach `/home/signflow/app/.env` anlegen und `IONOS_AI_TOKEN` eintragen.

## Endpoints

- `GET /healthz` → `{ ok: true }`
- `POST /anonymize` → `{ anonymized, mapping, stages }`

Body:
```json
{ "text": "Rohbericht…" }
```

## Kill-Switches

Wenn Stage 2 oder 3 kaputt sind, pro Stage deaktivieren via Env:
```
STAGE2_GLINER=off
STAGE3_LLAMA=off
```

Der Proxy liefert dann nur regex-basierte Anonymisierung — für Debugging oder bei AI-Hub-Ausfall.

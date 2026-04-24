"""
Persistenter GLiNER-NER-Server.

Node-Seite spawnt diesen Prozess einmal beim Proxy-Start und kommuniziert
über stdin/stdout via Line-Protocol (eine JSON-Zeile rein, eine JSON-Zeile
raus). Dadurch zahlen wir den Modell-Ladeaufwand (~3–5 s) nur einmal, nicht
pro Request.

Protokoll:
  In:  {"text": "<utf8 string>"}\\n
  Out: {"entities": [{"label": "...", "text": "...", "start": n, "end": m}]}\\n
  Error: {"error": "..."}\\n
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

from gliner import GLiNER

MODEL_NAME = os.environ.get("GLINER_MODEL", "knowledgator/gliner-pii-base-v1.0")
LABELS = ["person", "location", "organization"]
THRESHOLD = float(os.environ.get("GLINER_THRESHOLD", "0.5"))


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> None:
    sys.stderr.write(f"[gliner] loading {MODEL_NAME}\n")
    sys.stderr.flush()
    model = GLiNER.from_pretrained(MODEL_NAME)
    sys.stderr.write("[gliner] ready\n")
    sys.stderr.flush()
    emit({"ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
            text = payload["text"]
        except (json.JSONDecodeError, KeyError) as exc:
            emit({"error": f"bad request: {exc}"})
            continue

        try:
            raw = model.predict_entities(text, LABELS, threshold=THRESHOLD)
            entities = [
                {
                    "label": ent["label"].upper(),
                    "text": ent["text"],
                    "start": ent["start"],
                    "end": ent["end"],
                }
                for ent in raw
            ]
            emit({"entities": entities})
        except Exception as exc:
            emit({"error": f"predict failed: {exc}"})


if __name__ == "__main__":
    main()

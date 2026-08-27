#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
DATA_DIR = ROOT / "data"
DEFAULT_STATE_PATH = DATA_DIR / "default-state.json"
RUNTIME_STATE_PATH = DATA_DIR / "runtime-state.json"
HOST = os.environ.get("CALIONDA_PI_HOST", "0.0.0.0")
PORT = int(os.environ.get("CALIONDA_PI_PORT", "8000"))


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_state() -> dict:
    for path in (RUNTIME_STATE_PATH, DEFAULT_STATE_PATH):
        if not path.exists():
            continue

        try:
            with path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            continue

        if isinstance(payload, dict):
            return payload

    return {
        "display_id": "calionda-main",
        "type": "ripples",
        "version": 0,
        "updated_at": iso_now(),
        "state": {},
    }


class CaliondaPiHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/state":
            self.serve_json(load_state())
            return

        if parsed.path == "/api/health":
            self.serve_json(
                {
                    "ok": True,
                    "service": "caliondapi",
                    "time": iso_now(),
                    "state_source": "runtime" if RUNTIME_STATE_PATH.exists() else "default",
                }
            )
            return

        if parsed.path == "/":
            self.path = "/index.html"

        super().do_GET()

    def log_message(self, format: str, *args) -> None:
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{stamp}] {self.address_string()} {format % args}")

    def serve_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    server = ThreadingHTTPServer((HOST, PORT), CaliondaPiHandler)
    print(f"Calionda Pi server listening on http://{HOST}:{PORT}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

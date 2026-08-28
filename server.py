#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any
from urllib.parse import quote, urlparse


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
DATA_DIR = ROOT / "data"
DEFAULT_STATE_PATH = DATA_DIR / "default-state.json"
RUNTIME_STATE_PATH = DATA_DIR / "runtime-state.json"
SYNC_STATUS_PATH = DATA_DIR / "sync-status.json"
HOST = os.environ.get("CALIONDA_PI_HOST", "0.0.0.0")
PORT = int(os.environ.get("CALIONDA_PI_PORT", "8000"))
DISPLAY_ID = os.environ.get("CALIONDA_PI_DISPLAY_ID", "calionda-main")
CLOUD_BASE_URL = os.environ.get("CALIONDA_CLOUD_BASE_URL", "https://calionda.com").rstrip("/")
LIVE_WEBSOCKET_BASE_URL = os.environ.get("CALIONDA_CLOUD_WEBSOCKET_BASE_URL", "").rstrip("/")
ENABLE_LIVE_WEBSOCKET = os.environ.get("CALIONDA_ENABLE_LIVE_WEBSOCKET", "1").lower() in {"1", "true", "yes", "on"}
STATE_LOCK = threading.Lock()
SYNC_STATUS: dict[str, Any] = {
    "cloud_url": "",
    "live_websocket_url": "",
    "last_attempt_at": None,
    "last_success_at": None,
    "last_error": None,
    "last_result": "idle",
    "state_version": None,
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with NamedTemporaryFile("w", encoding="utf-8", delete=False, dir=str(path.parent)) as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
        temp_name = handle.name

    Path(temp_name).replace(path)


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
        "display_id": DISPLAY_ID,
        "type": "ripples",
        "version": 0,
        "updated_at": iso_now(),
        "state": {},
    }


def fallback_live_websocket_url() -> str:
    if LIVE_WEBSOCKET_BASE_URL:
        base = LIVE_WEBSOCKET_BASE_URL
    else:
        parsed = urlparse(CLOUD_BASE_URL)
        scheme = "wss" if parsed.scheme == "https" else "ws"
        authority = parsed.netloc
        path = parsed.path.rstrip("/")
        base = f"{scheme}://{authority}{path}"

    return f"{base}/ws?display_id={quote(DISPLAY_ID)}&client=pi"


def load_sync_status() -> dict:
    with STATE_LOCK:
        status = dict(SYNC_STATUS)

        if SYNC_STATUS_PATH.exists():
            try:
                with SYNC_STATUS_PATH.open("r", encoding="utf-8") as handle:
                    payload = json.load(handle)
            except (OSError, json.JSONDecodeError):
                payload = None

            if isinstance(payload, dict):
                status.update(payload)

        status["live_websocket_url"] = status.get("live_websocket_url") or fallback_live_websocket_url()
        status["live_websocket_enabled"] = ENABLE_LIVE_WEBSOCKET
        status["state_source"] = "runtime" if RUNTIME_STATE_PATH.exists() else "default"

        return status


def store_sync_status(**updates: Any) -> None:
    with STATE_LOCK:
        SYNC_STATUS.update(updates)
        payload = dict(SYNC_STATUS)
        payload["live_websocket_url"] = payload.get("live_websocket_url") or fallback_live_websocket_url()
        payload["live_websocket_enabled"] = ENABLE_LIVE_WEBSOCKET
        atomic_write_json(SYNC_STATUS_PATH, payload)


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
                    **load_sync_status(),
                }
            )
            return

        if parsed.path == "/":
            self.path = "/index.html"

        super().do_GET()

    def log_message(self, format: str, *args) -> None:
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{stamp}] {self.address_string()} {format % args}")

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def serve_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    store_sync_status(last_result="local", last_error=None, live_websocket_url=fallback_live_websocket_url())

    server = ThreadingHTTPServer((HOST, PORT), CaliondaPiHandler)
    print(f"Calionda Pi server listening on http://{HOST}:{PORT}")
    print(f"Using local active state from {RUNTIME_STATE_PATH if RUNTIME_STATE_PATH.exists() else DEFAULT_STATE_PATH}")
    print(f"Cloud touch WebSocket: {'enabled' if ENABLE_LIVE_WEBSOCKET else 'disabled'}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

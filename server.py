#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen


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
SYNC_INTERVAL_SECONDS = max(5, int(os.environ.get("CALIONDA_SYNC_INTERVAL_SECONDS", "15")))
SYNC_TIMEOUT_SECONDS = max(1, int(os.environ.get("CALIONDA_SYNC_TIMEOUT_SECONDS", "8")))
STATE_LOCK = threading.Lock()
SYNC_STATUS: dict[str, Any] = {
    "cloud_url": "",
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


def cloud_state_url() -> str:
    return f"{CLOUD_BASE_URL}/api/displays/{quote(DISPLAY_ID)}/state"


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

        status["cloud_url"] = cloud_state_url()
        status["state_source"] = "runtime" if RUNTIME_STATE_PATH.exists() else "default"

        return status


def store_sync_status(**updates: Any) -> None:
    with STATE_LOCK:
        SYNC_STATUS.update(updates)
        payload = dict(SYNC_STATUS)
        payload["cloud_url"] = cloud_state_url()
        atomic_write_json(SYNC_STATUS_PATH, payload)


def normalize_cloud_state(payload: dict) -> dict:
    state = payload.get("state")
    config = state if isinstance(state, dict) else {}
    config_type = payload.get("type") or config.get("type") or "ripples"

    return {
        "display_id": payload.get("display_id") or DISPLAY_ID,
        "type": config_type,
        "version": int(payload.get("version") or 0),
        "updated_at": payload.get("published_at") or payload.get("updated_at") or iso_now(),
        "active_config_id": payload.get("active_config_id"),
        "state": {
            **config,
            "type": config_type,
        },
    }


def fetch_cloud_state() -> dict:
    request = Request(
        cloud_state_url(),
        headers={
            "Accept": "application/json",
            "User-Agent": "caliondapi/0.1",
        },
        method="GET",
    )

    with urlopen(request, timeout=SYNC_TIMEOUT_SECONDS) as response:
        payload = json.loads(response.read().decode("utf-8"))

    if not isinstance(payload, dict):
        raise ValueError("Cloud state response was not a JSON object")

    return normalize_cloud_state(payload)


def sync_cloud_state_once() -> dict:
    store_sync_status(last_attempt_at=iso_now(), last_result="syncing", last_error=None)

    cloud_state = fetch_cloud_state()
    current_state = load_state()

    with STATE_LOCK:
        current_version = int(current_state.get("version") or 0)

        if int(cloud_state.get("version") or 0) >= current_version:
            atomic_write_json(RUNTIME_STATE_PATH, cloud_state)

    store_sync_status(
        last_success_at=iso_now(),
        last_result="ok",
        last_error=None,
        state_version=cloud_state.get("version"),
    )

    return cloud_state


def sync_loop() -> None:
    while True:
        try:
            sync_cloud_state_once()
        except HTTPError as error:
            store_sync_status(last_result="error", last_error=f"HTTP {error.code}")
        except URLError as error:
            store_sync_status(last_result="error", last_error=f"Network error: {error.reason}")
        except Exception as error:  # noqa: BLE001
            store_sync_status(last_result="error", last_error=str(error))

        time.sleep(SYNC_INTERVAL_SECONDS)


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

        if parsed.path == "/api/sync":
            try:
                state = sync_cloud_state_once()
                self.serve_json(
                    {
                        "ok": True,
                        "synced_at": iso_now(),
                        "state": state,
                    }
                )
            except Exception as error:  # noqa: BLE001
                self.serve_json(
                    {
                        "ok": False,
                        "error": str(error),
                        **load_sync_status(),
                    },
                    status=HTTPStatus.BAD_GATEWAY,
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
    store_sync_status(cloud_url=cloud_state_url())

    sync_thread = threading.Thread(target=sync_loop, name="calionda-sync", daemon=True)
    sync_thread.start()

    server = ThreadingHTTPServer((HOST, PORT), CaliondaPiHandler)
    print(f"Calionda Pi server listening on http://{HOST}:{PORT}")
    print(f"Polling active state from {cloud_state_url()} every {SYNC_INTERVAL_SECONDS} seconds")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

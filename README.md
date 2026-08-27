# Calionda Pi Runtime

This repo is the standalone Raspberry Pi runtime for the Calionda sculpture.

Current first-pass features:

- tiny local Python web server
- root page at `http://localhost:8000/`
- local JSON state endpoint at `/api/state`
- engine-by-type rendering for `ripples` and `clouds`
- on-screen debug panel outside the `255 x 36` Pixelblaster capture area
- background cloud sync for the active Calionda display state

## Run locally

```bash
python3 server.py
```

Then open:

```text
http://localhost:8000/
```

## Files

- `server.py` local HTTP server
- `data/default-state.json` last-known-good fallback config
- `data/runtime-state.json` last cloud-synced active state
- `static/index.html` standalone output page
- `static/js/ripples-renderer.js` ripple animation engine
- `static/js/clouds-renderer.js` clouds animation engine
- `static/js/output.js` local page bootstrap and polling
- `monitor.sh` mirror both HDMI outputs on the Pi

## Notes

- The output canvas is positioned at `50px, 50px` and sized to `255 x 36`.
- Debug UI starts at `left: 400px` to stay out of the Pixelblaster capture zone.
- The server polls `https://calionda.com/api/displays/calionda-main/state` by default every 15 seconds.
- Override runtime settings with:
  - `CALIONDA_PI_DISPLAY_ID`
  - `CALIONDA_CLOUD_BASE_URL`
  - `CALIONDA_SYNC_INTERVAL_SECONDS`
  - `CALIONDA_SYNC_TIMEOUT_SECONDS`

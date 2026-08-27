# Calionda Pi Runtime

This repo is the standalone Raspberry Pi runtime for the Calionda sculpture.

Current first-pass features:

- tiny local Python web server
- root page at `http://localhost:8000/`
- local JSON state endpoint at `/api/state`
- ripple renderer that runs fully offline
- on-screen debug panel outside the `255 x 36` Pixelblaster capture area

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
- `static/index.html` standalone output page
- `static/js/ripples-renderer.js` ripple animation engine
- `static/js/output.js` local page bootstrap and polling
- `monitor.sh` mirror both HDMI outputs on the Pi

## Notes

- The output canvas is positioned at `50px, 50px` and sized to `255 x 36`.
- Debug UI starts at `left: 400px` to stay out of the Pixelblaster capture zone.
- This first pass does not include cloud sync or local websocket relay yet.

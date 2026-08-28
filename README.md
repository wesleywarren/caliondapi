# Calionda Pi Runtime

This repo is the standalone Raspberry Pi runtime for the Calionda sculpture.

Current first-pass features:

- tiny local Python web server
- root page at `http://localhost:8000/`
- local JSON state endpoint at `/api/state`
- engine-by-type rendering for `ripples`, `clouds`, and `rain`
- on-screen debug panel outside the `255 x 36` Pixelblaster capture area
- local active config as the sole render source
- cloud touch-event WebSocket bridge with outbound state snapshots
- boot-ready kiosk launcher and service templates

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
- `data/runtime-state.json` local active state override (never cloud-synced)
- `static/index.html` standalone output page
- `static/js/ripples-renderer.js` ripple animation engine
- `static/js/rain-renderer.js` rain animation engine
- `static/js/clouds-renderer.js` clouds animation engine
- `static/js/output.js` local page bootstrap and polling
- `monitor.sh` mirror both HDMI outputs on the Pi
- `scripts/launch_kiosk.sh` waits for the local server and opens Chromium fullscreen
- `deploy/caliondapi.service` systemd unit for the local server
- `deploy/calionda-pi.desktop` desktop autostart entry for the kiosk browser

## Notes

- The output canvas is positioned at `50px, 50px` and sized to `255 x 36`.
- Debug UI starts at `left: 400px` to stay out of the Pixelblaster capture zone.
- The Pi never pulls active config from the cloud. It renders `data/runtime-state.json` when present, otherwise `data/default-state.json`.
- Override runtime settings with:
  - `CALIONDA_PI_DISPLAY_ID`
  - `CALIONDA_CLOUD_BASE_URL`
  - `CALIONDA_CLOUD_WEBSOCKET_BASE_URL`
  - `CALIONDA_ENABLE_LIVE_WEBSOCKET` (enabled by default)

- Touch events arrive over the cloud WebSocket. The output page reconnects automatically if the link drops.
- The output page sends a current animation snapshot over that WebSocket every 3 seconds. Snapshots are outbound-only and do not alter the Pi renderer.

## Autostart On Pi

These steps assume the repo is installed at `/home/pi/caliondapi`.

Make the kiosk script executable:

```bash
chmod +x /home/pi/caliondapi/scripts/launch_kiosk.sh
chmod +x /home/pi/caliondapi/monitor.sh
```

Install the local server as a system service:

```bash
sudo cp /home/pi/caliondapi/deploy/caliondapi.service /etc/systemd/system/caliondapi.service
sudo systemctl daemon-reload
sudo systemctl enable caliondapi.service
sudo systemctl restart caliondapi.service
```

Install the Chromium autostart entry for the `pi` desktop session:

```bash
mkdir -p /home/pi/.config/autostart
cp /home/pi/caliondapi/deploy/calionda-pi.desktop /home/pi/.config/autostart/calionda-pi.desktop
```

Reboot to test:

```bash
sudo reboot
```

Useful checks after boot:

```bash
systemctl status caliondapi.service
curl -s http://127.0.0.1:8000/api/health
```

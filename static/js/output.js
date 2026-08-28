(function () {
    function rendererLibraryForType(type) {
        if (type === "rain" && window.CaliondaRain) {
            return window.CaliondaRain;
        }

        if (type === "clouds" && window.CaliondaClouds) {
            return window.CaliondaClouds;
        }

        return window.CaliondaRipples;
    }

    function normalizeConfigForType(config) {
        const library = rendererLibraryForType(config && config.type);
        return library.normalizeConfig(config || library.DEFAULT_CONFIG);
    }

    const fallbackState = {
        display_id: "calionda-main",
        type: "ripples",
        version: 0,
        updated_at: null,
        state: window.CaliondaRipples.DEFAULT_CONFIG
    };

    const canvas = document.getElementById("pixelblaster-output");
    const configVersionEl = document.getElementById("config-version");
    const engineTypeEl = document.getElementById("engine-type");
    const stateSourceEl = document.getElementById("state-source");
    const lastSyncEl = document.getElementById("last-sync");
    const syncStatusEl = document.getElementById("sync-status");
    const logEl = document.getElementById("log");
    const fallbackDisplayId = "calionda-main";

    let currentVersion = null;
    let runner = null;
    let activeType = "ripples";
    let liveSocket = null;
    let liveSocketUrl = null;
    let liveConnected = false;
    let liveWebsocketEnabled = false;
    let reconnectTimer = 0;
    let heartbeatTimer = 0;
    let snapshotTimer = 0;
    let lastHealthResult = "booting";
    let lastLoggedSyncError = "";

    function log(message, tone) {
        const item = document.createElement("li");
        const stamp = new Date().toLocaleTimeString();
        item.textContent = `[${stamp}] ${message}`;
        if (tone) {
            item.classList.add(tone);
        }
        logEl.prepend(item);

        while (logEl.children.length > 12) {
            logEl.removeChild(logEl.lastChild);
        }
    }

    function ensureRunner(config) {
        const nextType = (config && config.type) || "ripples";
        const library = rendererLibraryForType(nextType);

        if (!runner) {
            runner = library.createCanvasRunner({
                canvas,
                config,
                mode: "output",
                alpha: false
            });
            runner.start();
            activeType = nextType;
            return;
        }

        if (nextType !== activeType) {
            runner.destroy();
            runner = library.createCanvasRunner({
                canvas,
                config,
                mode: "output",
                alpha: false
            });
            runner.start();
            activeType = nextType;
            log(`Switched renderer to ${nextType}`, "ok");
            return;
        }

        runner.applyConfig(config);
    }

    function updateSyncStatus() {
        const liveLabel = liveConnected ? "live" : "polling";
        const syncLabel = lastHealthResult || "unknown";
        syncStatusEl.textContent = `${syncLabel} / ${liveLabel}`;
        syncStatusEl.className = liveConnected || lastHealthResult === "ok" ? "meta-value ok" : "meta-value warn";
    }

    function applyState(payload, source) {
        const config = normalizeConfigForType((payload && payload.state) || fallbackState.state);
        const nextVersion = payload && payload.version != null ? payload.version : currentVersion;
        const nextType = (payload && payload.type) || config.type || activeType;

        document.documentElement.style.setProperty("--crop-x", `${config.cropX}px`);
        document.documentElement.style.setProperty("--crop-y", `${config.cropY}px`);
        configVersionEl.textContent = nextVersion == null ? "-" : String(nextVersion);
        engineTypeEl.textContent = nextType;
        stateSourceEl.textContent = source;
        stateSourceEl.className = source === "fallback" ? "meta-value warn" : "meta-value ok";
        lastSyncEl.textContent = payload.updated_at || "local default";
        currentVersion = nextVersion;

        ensureRunner(config);
    }

    function currentSnapshotPayload() {
        if (!runner || typeof runner.getSnapshot !== "function" || typeof runner.getConfig !== "function") {
            return null;
        }

        return {
            state_id: `pi-${Date.now()}`,
            config_version: runner.getConfig().version || currentVersion || null,
            ...runner.getSnapshot()
        };
    }

    function sendSocketMessage(payload) {
        if (!liveSocket || liveSocket.readyState !== window.WebSocket.OPEN) {
            return false;
        }

        liveSocket.send(JSON.stringify(payload));
        return true;
    }

    function sendCurrentState() {
        const snapshot = currentSnapshotPayload();

        if (!snapshot) {
            return false;
        }

        return sendSocketMessage({
            type: "current_state",
            display_id: currentStateDisplayId(),
            state: snapshot
        });
    }

    function currentStateDisplayId() {
        const payloadDisplayId = runner && typeof runner.getConfig === "function" ? runner.getConfig().display_id : null;
        return payloadDisplayId || fallbackDisplayId;
    }

    function clearLiveTimers() {
        window.clearTimeout(reconnectTimer);
        window.clearInterval(heartbeatTimer);
        window.clearInterval(snapshotTimer);
        reconnectTimer = 0;
        heartbeatTimer = 0;
        snapshotTimer = 0;
    }

    function scheduleReconnect() {
        if (reconnectTimer) {
            return;
        }

        reconnectTimer = window.setTimeout(function () {
            reconnectTimer = 0;
            connectLiveSocket(liveSocketUrl);
        }, 2000);
    }

    function handleLiveMessage(payload) {
        if (!payload || typeof payload !== "object") {
            return;
        }

        if (payload.type === "heartbeat") {
            return;
        }

        if (payload.type === "touch_event" && payload.event && runner && typeof runner.addEvents === "function") {
            runner.addEvents([payload.event]);
            return;
        }

        if (payload.type === "hello") {
            log("Live touch bridge connected; local config remains authoritative", "ok");
            return;
        }
    }

    function connectLiveSocket(url) {
        liveSocketUrl = url || liveSocketUrl;

        if (!liveWebsocketEnabled || !liveSocketUrl || typeof window.WebSocket !== "function") {
            liveConnected = false;
            updateSyncStatus();
            return;
        }

        if (liveSocket && (liveSocket.readyState === window.WebSocket.OPEN || liveSocket.readyState === window.WebSocket.CONNECTING)) {
            return;
        }

        try {
            liveSocket = new window.WebSocket(liveSocketUrl);
        } catch (error) {
            liveConnected = false;
            updateSyncStatus();
            scheduleReconnect();
            return;
        }

        liveSocket.addEventListener("open", function () {
            const displayId = currentStateDisplayId();

            liveConnected = true;
            updateSyncStatus();
            log("Live socket open", "ok");

            sendSocketMessage({
                type: "subscribe",
                display_id: displayId,
                client: "pi"
            });

            sendCurrentState();

            heartbeatTimer = window.setInterval(function () {
                sendSocketMessage({
                    type: "heartbeat",
                    display_id: displayId,
                    client: "pi"
                });
            }, 10000);

            snapshotTimer = window.setInterval(function () {
                sendCurrentState();
            }, 3000);
        });

        liveSocket.addEventListener("message", function (event) {
            try {
                handleLiveMessage(JSON.parse(event.data));
            } catch (error) {
                // Ignore malformed live messages and keep the socket open.
            }
        });

        liveSocket.addEventListener("close", function () {
            clearLiveTimers();
            liveConnected = false;
            updateSyncStatus();
            log("Live socket closed; reconnecting for touch events", "warn");
            scheduleReconnect();
        });

        liveSocket.addEventListener("error", function () {
            liveConnected = false;
            updateSyncStatus();
        });
    }

    async function refreshState() {
        try {
            const response = await fetch("/api/state", {
                cache: "no-store",
                headers: {
                    "Accept": "application/json"
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const payload = await response.json();
            const previousVersion = currentVersion;
            applyState(payload, "local api");

            if (payload.version !== previousVersion) {
                log(`Loaded state version ${payload.version ?? "unknown"} from local API`, "ok");
            }
        } catch (error) {
            applyState(fallbackState, "fallback");
            log(`Using fallback config: ${error.message}`, "warn");
        }
    }

    async function refreshHealth() {
        try {
            const response = await fetch("/api/health", {
                cache: "no-store",
                headers: {
                    "Accept": "application/json"
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const payload = await response.json();
            lastHealthResult = payload.last_result || "unknown";
            liveWebsocketEnabled = payload.live_websocket_enabled === true;
            updateSyncStatus();

            if (liveWebsocketEnabled && payload.live_websocket_url) {
                connectLiveSocket(payload.live_websocket_url);
            }

            if (payload.last_error) {
                const message = `Touch link issue: ${payload.last_error}`;
                if (message !== lastLoggedSyncError) {
                    log(message, "warn");
                    lastLoggedSyncError = message;
                }
            }
        } catch (error) {
            lastHealthResult = "offline";
            updateSyncStatus();
        }
    }

    applyState(fallbackState, "fallback");
    log("Output booted with local fallback config", "ok");
    refreshState();
    refreshHealth();

    window.setInterval(refreshHealth, 10000);

    window.addEventListener("click", function (event) {
        if (!runner || typeof runner.addEvents !== "function") {
            return;
        }

        runner.addEvents([
            {
                x: event.clientX - canvas.offsetLeft,
                y: event.clientY - canvas.offsetTop,
                strength: 1.5
            }
        ]);
        log("Manual test pulse injected", "ok");
    });
}());

(function () {
    function rendererLibraryForType(type) {
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
    const displayIdEl = document.getElementById("display-id");
    const configVersionEl = document.getElementById("config-version");
    const engineTypeEl = document.getElementById("engine-type");
    const stateSourceEl = document.getElementById("state-source");
    const lastSyncEl = document.getElementById("last-sync");
    const syncStatusEl = document.getElementById("sync-status");
    const logEl = document.getElementById("log");

    let currentVersion = null;
    let runner = null;
    let activeType = "ripples";

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

    function applyState(payload, source) {
        const config = normalizeConfigForType((payload && payload.state) || fallbackState.state);
        const nextVersion = payload && payload.version != null ? payload.version : currentVersion;
        const nextType = (payload && payload.type) || config.type || activeType;

        document.documentElement.style.setProperty("--crop-x", `${config.cropX}px`);
        document.documentElement.style.setProperty("--crop-y", `${config.cropY}px`);
        displayIdEl.textContent = payload.display_id || "calionda-main";
        configVersionEl.textContent = nextVersion == null ? "-" : String(nextVersion);
        engineTypeEl.textContent = nextType;
        stateSourceEl.textContent = source;
        stateSourceEl.className = source === "fallback" ? "meta-value warn" : "meta-value ok";
        lastSyncEl.textContent = payload.updated_at || "local default";
        currentVersion = nextVersion;

        ensureRunner(config);
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
            syncStatusEl.textContent = payload.last_result || "unknown";
            syncStatusEl.className = payload.last_result === "ok" ? "meta-value ok" : "meta-value warn";

            if (payload.last_error) {
                const newest = logEl.firstChild ? logEl.firstChild.textContent : "";
                const message = `Cloud sync issue: ${payload.last_error}`;
                if (!newest.includes(message)) {
                    log(message, "warn");
                }
            }
        } catch (error) {
            syncStatusEl.textContent = "offline";
            syncStatusEl.className = "meta-value warn";
        }
    }

    applyState(fallbackState, "fallback");
    log("Output booted with local fallback config", "ok");
    refreshState();
    refreshHealth();

    window.setInterval(refreshState, 10000);
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

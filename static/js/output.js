(function () {
    const fallbackState = {
        display_id: "calionda-main",
        version: 0,
        updated_at: null,
        state: window.CaliondaRipples.DEFAULT_CONFIG
    };

    const canvas = document.getElementById("pixelblaster-output");
    const displayIdEl = document.getElementById("display-id");
    const configVersionEl = document.getElementById("config-version");
    const stateSourceEl = document.getElementById("state-source");
    const lastSyncEl = document.getElementById("last-sync");
    const logEl = document.getElementById("log");

    const runner = window.CaliondaRipples.createCanvasRunner({
        canvas,
        config: fallbackState.state,
        alpha: false
    });

    let currentVersion = null;

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

    function applyState(payload, source) {
        const config = window.CaliondaRipples.normalizeConfig((payload && payload.state) || fallbackState.state);
        currentVersion = payload && payload.version != null ? payload.version : currentVersion;

        document.documentElement.style.setProperty("--crop-x", `${config.cropX}px`);
        document.documentElement.style.setProperty("--crop-y", `${config.cropY}px`);
        displayIdEl.textContent = payload.display_id || "calionda-main";
        configVersionEl.textContent = currentVersion == null ? "-" : String(currentVersion);
        stateSourceEl.textContent = source;
        stateSourceEl.className = source === "fallback" ? "meta-value warn" : "meta-value ok";
        lastSyncEl.textContent = payload.updated_at || "local default";

        runner.applyConfig(config);
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
            applyState(payload, "local api");

            if (payload.version !== currentVersion) {
                log(`Loaded state version ${payload.version ?? "unknown"} from local API`, "ok");
            }
        } catch (error) {
            applyState(fallbackState, "fallback");
            log(`Using fallback config: ${error.message}`, "warn");
        }
    }

    function addDemoTouch() {
        const config = runner.getConfig();
        runner.addEvents([
            {
                x: config.originX,
                y: config.originY,
                strength: 1.2
            }
        ]);
    }

    runner.start();
    applyState(fallbackState, "fallback");
    log("Output booted with local fallback config", "ok");
    refreshState();

    window.setInterval(refreshState, 10000);
    window.setInterval(addDemoTouch, 4000);

    window.addEventListener("click", function (event) {
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

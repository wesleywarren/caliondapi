(function () {
    const UINT32_MAX = 0x100000000;
    const DEFAULT_CONFIG = {
        type: 'rain',
        backgroundTop: '#020611',
        backgroundBottom: '#061427',
        rainColor: '#71d6ff',
        accentColor: '#d7f6ff',
        density: 0.6,
        speed: 0.58,
        wind: 0.12,
        sway: 0.35,
        dropLength: 0.52,
        thickness: 1.3,
        glow: 0.46,
        splash: 0.58,
        mist: 0.2,
        showMask: true,
        virtualWidth: 255,
        virtualHeight: 360,
        outputWidth: 255,
        outputHeight: 36,
        verticalScale: 10,
        cropX: 50,
        cropY: 50,
    };

    function clampNumber(value, fallback, min, max) {
        const parsed = Number(value);

        if (!Number.isFinite(parsed)) {
            return fallback;
        }

        return Math.max(min, Math.min(max, parsed));
    }

    function normalizeUint32(value, fallback) {
        const parsed = Number(value);

        if (!Number.isFinite(parsed)) {
            return fallback >>> 0;
        }

        return Math.floor(parsed) >>> 0;
    }

    function normalizeConfig(nextConfig) {
        const merged = {
            ...DEFAULT_CONFIG,
            ...(nextConfig || {}),
        };

        return {
            ...merged,
            type: 'rain',
            backgroundTop: /^#[0-9a-f]{6}$/i.test(String(merged.backgroundTop || '')) ? merged.backgroundTop : DEFAULT_CONFIG.backgroundTop,
            backgroundBottom: /^#[0-9a-f]{6}$/i.test(String(merged.backgroundBottom || '')) ? merged.backgroundBottom : DEFAULT_CONFIG.backgroundBottom,
            rainColor: /^#[0-9a-f]{6}$/i.test(String(merged.rainColor || '')) ? merged.rainColor : DEFAULT_CONFIG.rainColor,
            accentColor: /^#[0-9a-f]{6}$/i.test(String(merged.accentColor || '')) ? merged.accentColor : DEFAULT_CONFIG.accentColor,
            density: clampNumber(merged.density, DEFAULT_CONFIG.density, 0.05, 1),
            speed: clampNumber(merged.speed, DEFAULT_CONFIG.speed, 0.2, 1),
            wind: clampNumber(merged.wind, DEFAULT_CONFIG.wind, -1, 1),
            sway: clampNumber(merged.sway, DEFAULT_CONFIG.sway, 0, 1),
            dropLength: clampNumber(merged.dropLength, DEFAULT_CONFIG.dropLength, 0.1, 1),
            thickness: clampNumber(merged.thickness, DEFAULT_CONFIG.thickness, 0.4, 3),
            glow: clampNumber(merged.glow, DEFAULT_CONFIG.glow, 0, 1),
            splash: clampNumber(merged.splash, DEFAULT_CONFIG.splash, 0, 1),
            mist: clampNumber(merged.mist, DEFAULT_CONFIG.mist, 0, 1),
            showMask: merged.showMask !== false,
            virtualWidth: Math.max(1, Math.round(clampNumber(merged.virtualWidth, DEFAULT_CONFIG.virtualWidth, 1, 4096))),
            virtualHeight: Math.max(1, Math.round(clampNumber(merged.virtualHeight, DEFAULT_CONFIG.virtualHeight, 1, 4096))),
            outputWidth: Math.max(1, Math.round(clampNumber(merged.outputWidth, DEFAULT_CONFIG.outputWidth, 1, 4096))),
            outputHeight: Math.max(1, Math.round(clampNumber(merged.outputHeight, DEFAULT_CONFIG.outputHeight, 1, 4096))),
            verticalScale: clampNumber(merged.verticalScale, DEFAULT_CONFIG.verticalScale, 0.001, 1000),
            cropX: Math.round(clampNumber(merged.cropX, DEFAULT_CONFIG.cropX, -10000, 10000)),
            cropY: Math.round(clampNumber(merged.cropY, DEFAULT_CONFIG.cropY, -10000, 10000)),
        };
    }

    function hexToRgb(hex) {
        const normalized = String(hex || '#ffffff').replace('#', '');
        const safe = normalized.length === 3
            ? normalized.split('').map(function (char) { return char + char; }).join('')
            : normalized.padEnd(6, '0').slice(0, 6);

        return {
            r: parseInt(safe.slice(0, 2), 16),
            g: parseInt(safe.slice(2, 4), 16),
            b: parseInt(safe.slice(4, 6), 16),
        };
    }

    function rgbaString(hex, alpha) {
        const rgb = hexToRgb(hex);

        return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
    }

    function speedFactor(config) {
        return clampNumber(config && config.speed, DEFAULT_CONFIG.speed, 0.2, 1);
    }

    function cloneDrop(drop) {
        return {
            x: drop.x,
            y: drop.y,
            velocityX: drop.velocityX,
            velocityY: drop.velocityY,
            length: drop.length,
            thickness: drop.thickness,
            alpha: drop.alpha,
            seed: drop.seed,
        };
    }

    function cloneSplash(splash) {
        return {
            x: splash.x,
            y: splash.y,
            radius: splash.radius,
            maxRadius: splash.maxRadius,
            alpha: splash.alpha,
            decay: splash.decay,
            color: splash.color,
            ring: !!splash.ring,
        };
    }

    function createRainEngine(initialConfig) {
        let config = normalizeConfig(initialConfig);
        let rngState = 0x4f6c6921;
        let randomIndex = 0;
        let engineTimeMs = 0;
        let spawnCarry = 0;
        const drops = [];
        const splashes = [];

        function nextRandom() {
            rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
            randomIndex += 1;

            return rngState / UINT32_MAX;
        }

        function targetDropCount() {
            const slowBoost = 1 + (1 - speedFactor(config)) * 1.15;
            return Math.max(12, Math.round((22 + config.density * 210) * slowBoost));
        }

        function spawnDrop(xOverride, yOverride, speedBoost) {
            const width = config.virtualWidth;
            const height = config.virtualHeight;
            const speed = speedFactor(config);
            const baseLength = height * (0.03 + config.dropLength * 0.075);
            const velocityY = (42 + speed * 178) * (0.8 + nextRandom() * 0.6) * (speedBoost || 1);
            const velocityX = (config.wind * 55) + ((nextRandom() * 2 - 1) * config.sway * 18);
            drops.push({
                x: xOverride != null ? xOverride : nextRandom() * width,
                y: yOverride != null ? yOverride : (-height * (0.08 + nextRandom() * 0.18)),
                velocityX,
                velocityY,
                length: baseLength * (0.55 + nextRandom() * 1.2),
                thickness: Math.max(0.5, config.thickness * (0.65 + nextRandom() * 0.85)),
                alpha: 0.22 + nextRandom() * 0.45,
                seed: nextRandom() * Math.PI * 2,
            });
        }

        function spawnSplash(x, y, strength, color, ring) {
            splashes.push({
                x: clampNumber(x, config.virtualWidth / 2, 0, config.virtualWidth),
                y: clampNumber(y, config.virtualHeight * 0.9, 0, config.virtualHeight),
                radius: 3,
                maxRadius: (10 + config.splash * 36) * strength,
                alpha: Math.min(1, 0.26 + config.glow * 0.34) * strength,
                decay: 0.85 + nextRandom() * 0.55,
                color: /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : config.accentColor,
                ring: !!ring,
            });
        }

        function ensureDrops() {
            const desired = targetDropCount();

            while (drops.length < desired) {
                spawnDrop(nextRandom() * config.virtualWidth, nextRandom() * config.virtualHeight);
            }

            while (drops.length > desired) {
                drops.shift();
            }
        }

        function addEvents(events) {
            if (!Array.isArray(events)) {
                return;
            }

            events.forEach(function (event) {
                const x = clampNumber(event && event.x, config.virtualWidth / 2, 0, 255) / 255 * config.virtualWidth;
                const y = clampNumber(event && event.y, config.virtualHeight * 0.5, 0, 360) / 360 * config.virtualHeight;
                const strength = clampNumber(event && event.strength, 1, 0.2, 2);
                const color = /^#[0-9a-f]{6}$/i.test(String(event && event.color || '')) ? event.color : config.accentColor;

                spawnSplash(x, y, 1.35 * strength, color, true);

                for (let index = 0; index < Math.round(4 + config.splash * 7); index += 1) {
                    spawnDrop(
                        x + (nextRandom() * 2 - 1) * 24,
                        y - nextRandom() * 40,
                        1.05 + nextRandom() * 0.6 * strength
                    );
                }
            });
        }

        function fillBackdrop(ctx, width, height, timeSeconds) {
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, config.backgroundTop);
            gradient.addColorStop(1, config.backgroundBottom);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            const haze = ctx.createRadialGradient(
                width * (0.35 + Math.sin(timeSeconds * 0.07) * 0.08),
                height * 0.18,
                width * 0.05,
                width * 0.5,
                height * 0.2,
                width * 0.75
            );
            haze.addColorStop(0, rgbaString(config.accentColor, 0.12 + config.mist * 0.12));
            haze.addColorStop(0.5, rgbaString(config.rainColor, 0.03 + config.mist * 0.06));
            haze.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = haze;
            ctx.fillRect(0, 0, width, height);
        }

        function drawMist(ctx, width, height, timeSeconds) {
            if (config.mist <= 0.01) {
                return;
            }

            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.12 + config.mist * 0.18;

            for (let index = 0; index < 3; index += 1) {
                const x = width * (0.24 + index * 0.28 + Math.sin(timeSeconds * (0.04 + index * 0.01)) * 0.05);
                const y = height * (0.18 + index * 0.23 + Math.cos(timeSeconds * (0.05 + index * 0.02)) * 0.04);
                const radius = Math.min(width, height) * (0.22 + index * 0.07);
                const gradient = ctx.createRadialGradient(x, y, radius * 0.08, x, y, radius);
                gradient.addColorStop(0, rgbaString(config.accentColor, 0.32));
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }

        function updateDrops(deltaSeconds) {
            ensureDrops();
            const height = config.virtualHeight;
            const width = config.virtualWidth;
            const timeSeconds = engineTimeMs * 0.001;
            const speed = speedFactor(config);

            for (let index = drops.length - 1; index >= 0; index -= 1) {
                const drop = drops[index];
                const swayOffset = Math.sin(timeSeconds * 3.1 + drop.seed) * config.sway * 10;
                drop.x += (drop.velocityX + swayOffset) * deltaSeconds;
                drop.y += drop.velocityY * deltaSeconds;

                if (drop.y - drop.length > height) {
                    if (config.splash > 0.02 && nextRandom() < 0.33) {
                        spawnSplash(drop.x, height - 2, 0.68 + config.splash * 0.6 + (1 - speed) * 0.2, config.accentColor);
                    }

                    drop.x = nextRandom() * width;
                    drop.y = -drop.length - nextRandom() * height * 0.18;
                    drop.velocityY = (42 + speed * 178) * (0.8 + nextRandom() * 0.6);
                    drop.velocityX = (config.wind * 55) + ((nextRandom() * 2 - 1) * config.sway * 18);
                    drop.alpha = 0.22 + nextRandom() * 0.45;
                    drop.length = height * (0.03 + config.dropLength * 0.075) * (0.62 + nextRandom() * 1.05);
                    drop.thickness = Math.max(0.5, config.thickness * (0.65 + nextRandom() * 0.85));
                    drop.seed = nextRandom() * Math.PI * 2;
                } else if (drop.x < -24 || drop.x > width + 24) {
                    drop.x = ((drop.x % width) + width) % width;
                }
            }
        }

        function updateSplashes(deltaSeconds) {
            for (let index = splashes.length - 1; index >= 0; index -= 1) {
                const splash = splashes[index];
                splash.radius += splash.maxRadius * deltaSeconds * 1.8;
                splash.alpha -= deltaSeconds * splash.decay;

                if (splash.alpha <= 0 || splash.radius >= splash.maxRadius) {
                    splashes.splice(index, 1);
                }
            }
        }

        function drawRain(ctx) {
            ctx.save();
            ctx.lineCap = 'round';
            ctx.globalCompositeOperation = 'screen';

            for (let index = 0; index < drops.length; index += 1) {
                const drop = drops[index];
                const speed = speedFactor(config);
                const progress = Math.max(0, Math.min(1, drop.y / Math.max(1, config.virtualHeight)));
                const opacity = Math.min(1, drop.alpha * (0.6 + progress * 0.55 + (1 - speed) * 0.22));
                const gradient = ctx.createLinearGradient(drop.x, drop.y, drop.x + drop.velocityX * 0.08, drop.y + drop.length);
                gradient.addColorStop(0, rgbaString(config.accentColor, Math.min(1, opacity * 0.22)));
                gradient.addColorStop(0.24, rgbaString(config.accentColor, Math.min(1, opacity * 0.68)));
                gradient.addColorStop(1, rgbaString(config.rainColor, Math.min(1, opacity)));
                ctx.strokeStyle = gradient;
                ctx.globalAlpha = 0.48 + config.glow * 0.38;
                ctx.lineWidth = drop.thickness;
                ctx.beginPath();
                ctx.moveTo(drop.x, drop.y);
                ctx.lineTo(drop.x + drop.velocityX * 0.04, drop.y + drop.length);
                ctx.stroke();

                ctx.globalAlpha = 0.35;
                ctx.beginPath();
                ctx.moveTo(drop.x, drop.y);
                ctx.lineTo(drop.x + drop.velocityX * 0.025, drop.y + drop.length * 0.82);
                ctx.stroke();
            }

            ctx.restore();
        }

        function drawSplashes(ctx) {
            if (!splashes.length) {
                return;
            }

            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.lineCap = 'round';

            for (let index = 0; index < splashes.length; index += 1) {
                const splash = splashes[index];
                const visibleAlpha = Math.max(0, Math.min(1, splash.ring ? 0.95 : splash.alpha));
                ctx.strokeStyle = rgbaString(splash.color, visibleAlpha);
                ctx.fillStyle = rgbaString(splash.color, Math.max(0, splash.ring ? 0.32 : splash.alpha * 0.18));
                ctx.lineWidth = splash.ring ? Math.max(8, config.thickness * 4) : Math.max(1.2, config.thickness * 1.3);
                ctx.beginPath();
                ctx.arc(splash.x, splash.y, splash.radius, splash.ring ? 0 : Math.PI * 1.02, splash.ring ? Math.PI * 2 : Math.PI * 1.98);
                ctx.stroke();
                if (splash.ring) {
                    ctx.globalAlpha = 0.55;
                    ctx.beginPath();
                    ctx.arc(splash.x, splash.y, Math.max(2, splash.radius * 0.2), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.globalAlpha = Math.max(0, splash.alpha * 0.3);
                ctx.beginPath();
                ctx.arc(splash.x, splash.y - 1.5, Math.max(1.2, splash.radius * 0.2), 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            ctx.restore();
        }

        function render(ctx, deltaSeconds) {
            engineTimeMs += deltaSeconds * 1000;
            fillBackdrop(ctx, config.virtualWidth, config.virtualHeight, engineTimeMs * 0.001);
            drawMist(ctx, config.virtualWidth, config.virtualHeight, engineTimeMs * 0.001);
            updateDrops(deltaSeconds);
            updateSplashes(deltaSeconds);
            drawRain(ctx);
            drawSplashes(ctx);
        }

        function applyEngineState(nextState, options) {
            const elapsedMs = clampNumber(options && options.elapsedMs, 0, 0, 60000);
            engineTimeMs = clampNumber(nextState && nextState.engine_time_ms, engineTimeMs, 0, 1000000000) + elapsedMs;
            rngState = normalizeUint32(nextState && nextState.rng_state, rngState || 0x4f6c6921);
            randomIndex = Math.max(0, Math.round(clampNumber(nextState && nextState.random_index, 0, 0, 1000000000)));
            spawnCarry = clampNumber(nextState && nextState.spawn_carry, 0, 0, 1000000);

            drops.length = 0;
            if (Array.isArray(nextState && nextState.drops)) {
                nextState.drops.forEach(function (drop) {
                    drops.push({
                        x: clampNumber(drop && drop.x, config.virtualWidth / 2, -1000, 1000 + config.virtualWidth),
                        y: clampNumber(drop && drop.y, config.virtualHeight / 2, -1000, 1000 + config.virtualHeight),
                        velocityX: clampNumber(drop && drop.velocityX, 0, -500, 500),
                        velocityY: clampNumber(drop && drop.velocityY, 120, 1, 1000),
                        length: clampNumber(drop && drop.length, 20, 1, config.virtualHeight),
                        thickness: clampNumber(drop && drop.thickness, config.thickness, 0.2, 10),
                        alpha: clampNumber(drop && drop.alpha, 0.5, 0, 1),
                        seed: clampNumber(drop && drop.seed, 0, -1000, 1000),
                    });
                });
            }

            splashes.length = 0;
            if (Array.isArray(nextState && nextState.splashes)) {
                nextState.splashes.forEach(function (splash) {
                    splashes.push({
                        x: clampNumber(splash && splash.x, config.virtualWidth / 2, -1000, 1000 + config.virtualWidth),
                        y: clampNumber(splash && splash.y, config.virtualHeight * 0.9, -1000, 1000 + config.virtualHeight),
                        radius: clampNumber(splash && splash.radius, 2, 0, 1000),
                        maxRadius: clampNumber(splash && splash.maxRadius, 30, 1, 1000),
                        alpha: clampNumber(splash && splash.alpha, 0.5, 0, 1),
                        decay: clampNumber(splash && splash.decay, 1, 0.1, 10),
                        color: /^#[0-9a-f]{6}$/i.test(String(splash && splash.color || '')) ? splash.color : config.accentColor,
                        ring: !!(splash && splash.ring),
                    });
                });
            }

            ensureDrops();
        }

        function getEngineState() {
            return {
                engine_time_ms: Math.round(engineTimeMs),
                rng_state: rngState >>> 0,
                random_index: randomIndex,
                spawn_carry: spawnCarry,
                drops: drops.map(cloneDrop),
                splashes: splashes.map(cloneSplash),
            };
        }

        function setConfig(nextConfig) {
            config = normalizeConfig(nextConfig);
            ensureDrops();
        }

        ensureDrops();

        return {
            addEvents,
            applyEngineState,
            getConfig: function () {
                return { ...config };
            },
            getEngineState,
            setConfig,
            render,
        };
    }

    function buildPixelblasterFrame(virtualCanvas, outputCanvas, config) {
        const sourceContext = virtualCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
        const outputContext = outputCanvas.getContext('2d', { alpha: false });
        const source = sourceContext.getImageData(0, 0, config.virtualWidth, config.virtualHeight);
        const target = outputContext.createImageData(config.outputWidth, config.outputHeight);
        const yScale = config.verticalScale || (config.virtualHeight / config.outputHeight);
        const xLimit = Math.min(config.outputWidth, config.virtualWidth);

        for (let y = 0; y < config.outputHeight; y += 1) {
            const sourceStart = Math.max(0, Math.floor(y * yScale));
            const sourceEnd = Math.max(sourceStart + 1, Math.min(config.virtualHeight, Math.ceil((y + 1) * yScale)));

            for (let x = 0; x < xLimit; x += 1) {
                const targetIndex = (y * config.outputWidth + x) * 4;
                let redTotal = 0;
                let greenTotal = 0;
                let blueTotal = 0;
                let sampleCount = 0;

                for (let sourceY = sourceStart; sourceY < sourceEnd; sourceY += 1) {
                    const sourceIndex = (sourceY * config.virtualWidth + x) * 4;
                    redTotal += source.data[sourceIndex + 0];
                    greenTotal += source.data[sourceIndex + 1];
                    blueTotal += source.data[sourceIndex + 2];
                    sampleCount += 1;
                }

                target.data[targetIndex + 0] = Math.round(redTotal / sampleCount);
                target.data[targetIndex + 1] = Math.round(greenTotal / sampleCount);
                target.data[targetIndex + 2] = Math.round(blueTotal / sampleCount);
                target.data[targetIndex + 3] = 255;
            }
        }

        outputContext.putImageData(target, 0, 0);
    }

    function createCanvasRunner(options) {
        const canvas = options.canvas;
        const context = canvas.getContext('2d', { alpha: options.alpha !== false });
        const engine = createRainEngine(options.config || DEFAULT_CONFIG);
        const virtualCanvas = document.createElement('canvas');
        const virtualContext = virtualCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
        const mode = options.mode || 'preview';
        let config = engine.getConfig();
        let destroyed = false;
        let rafId = 0;
        let lastFrame = 0;

        function resizePreview() {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            virtualCanvas.width = config.virtualWidth;
            virtualCanvas.height = config.virtualHeight;
            canvas.width = Math.max(1, Math.round(rect.width * dpr));
            canvas.height = Math.max(1, Math.round(rect.height * dpr));
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.imageSmoothingEnabled = true;
        }

        function resizeOutput() {
            virtualCanvas.width = config.virtualWidth;
            virtualCanvas.height = config.virtualHeight;
            canvas.width = config.outputWidth;
            canvas.height = config.outputHeight;

            if (!options.preserveCssSize) {
                canvas.style.width = config.outputWidth + 'px';
                canvas.style.height = config.outputHeight + 'px';
            }
        }

        function applyConfig(nextConfig) {
            config = normalizeConfig({
                ...config,
                ...(nextConfig || {}),
            });
            engine.setConfig(config);

            if (mode === 'preview') {
                resizePreview();
            } else {
                resizeOutput();
            }
        }

        function applySnapshot(snapshot) {
            if (!snapshot || typeof snapshot !== 'object') {
                return;
            }

            if (snapshot.config && typeof snapshot.config === 'object') {
                applyConfig(snapshot.config);
            }

            if (snapshot.engine && typeof snapshot.engine === 'object') {
                const elapsedMs = Math.max(0, Date.now() - clampNumber(snapshot.snapshot_at_ms, Date.now(), 0, 10000000000000));
                engine.applyEngineState(snapshot.engine, { elapsedMs });
            }
        }

        function renderFrame(now) {
            if (destroyed) {
                return;
            }

            if (!lastFrame) {
                lastFrame = now;
            }

            const deltaSeconds = Math.min(0.05, (now - lastFrame) * 0.001);
            lastFrame = now;

            if (mode === 'preview') {
                context.clearRect(0, 0, canvas.width, canvas.height);
                engine.render(virtualContext, deltaSeconds);
                context.drawImage(virtualCanvas, 0, 0, canvas.width, canvas.height);
            } else {
                engine.render(virtualContext, deltaSeconds);
                buildPixelblasterFrame(virtualCanvas, canvas, config);
            }

            rafId = window.requestAnimationFrame(renderFrame);
        }

        applyConfig(config);

        return {
            start: function () {
                if (destroyed || rafId) {
                    return;
                }

                lastFrame = 0;
                rafId = window.requestAnimationFrame(renderFrame);
            },
            destroy: function () {
                destroyed = true;
                if (rafId) {
                    window.cancelAnimationFrame(rafId);
                    rafId = 0;
                }
            },
            applyConfig,
            applySnapshot,
            addEvents: engine.addEvents,
            getConfig: engine.getConfig,
            getSnapshot: function () {
                return {
                    config: engine.getConfig(),
                    engine: engine.getEngineState(),
                };
            },
        };
    }

    window.CaliondaRain = {
        DEFAULT_CONFIG,
        normalizeConfig,
        createCanvasRunner,
    };
}());

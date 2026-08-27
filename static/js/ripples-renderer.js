(function () {
    const UINT32_MAX = 0x100000000;
    const DEFAULT_CONFIG = {
        type: 'ripples',
        backgroundColor: '#000000',
        shape: 'circle',
        originX: 60,
        originY: 33,
        rippleColor: '#5cc8ff',
        colorVariation: 2,
        thickness: 4,
        sharpness: 7,
        speed: 0.45,
        interval: 5,
        intervalRandomness: 2,
        solidShapes: false,
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

    function normalizeConfig(nextConfig) {
        const merged = {
            ...DEFAULT_CONFIG,
            ...(nextConfig || {}),
        };

        return {
            ...merged,
            virtualWidth: Math.max(1, Math.round(clampNumber(merged.virtualWidth, DEFAULT_CONFIG.virtualWidth, 1, 4096))),
            virtualHeight: Math.max(1, Math.round(clampNumber(merged.virtualHeight, DEFAULT_CONFIG.virtualHeight, 1, 4096))),
            outputWidth: Math.max(1, Math.round(clampNumber(merged.outputWidth, DEFAULT_CONFIG.outputWidth, 1, 4096))),
            outputHeight: Math.max(1, Math.round(clampNumber(merged.outputHeight, DEFAULT_CONFIG.outputHeight, 1, 4096))),
            verticalScale: clampNumber(merged.verticalScale, DEFAULT_CONFIG.verticalScale, 0.001, 1000),
            cropX: Math.round(clampNumber(merged.cropX, DEFAULT_CONFIG.cropX, -10000, 10000)),
            cropY: Math.round(clampNumber(merged.cropY, DEFAULT_CONFIG.cropY, -10000, 10000)),
            originX: clampNumber(merged.originX, DEFAULT_CONFIG.originX, 0, 100),
            originY: clampNumber(merged.originY, DEFAULT_CONFIG.originY, 0, 100),
            colorVariation: clampNumber(merged.colorVariation, DEFAULT_CONFIG.colorVariation, 0, 10),
            thickness: clampNumber(merged.thickness, DEFAULT_CONFIG.thickness, 1, 100),
            sharpness: clampNumber(merged.sharpness, DEFAULT_CONFIG.sharpness, 0, 10),
            speed: clampNumber(merged.speed, DEFAULT_CONFIG.speed, 0.001, 10),
            interval: clampNumber(merged.interval, DEFAULT_CONFIG.interval, 0, 10),
            intervalRandomness: clampNumber(merged.intervalRandomness, DEFAULT_CONFIG.intervalRandomness, 0, 10),
            solidShapes: !!merged.solidShapes,
            showMask: !!merged.showMask,
        };
    }

    function hexToHsl(hex) {
        const normalized = String(hex || '#5cc8ff').replace('#', '');
        const safe = normalized.length === 3
            ? normalized.split('').map((char) => char + char).join('')
            : normalized.padEnd(6, '0').slice(0, 6);
        const r = parseInt(safe.slice(0, 2), 16) / 255;
        const g = parseInt(safe.slice(2, 4), 16) / 255;
        const b = parseInt(safe.slice(4, 6), 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        let s = 0;
        const l = (max + min) / 2;
        const d = max - min;

        if (d !== 0) {
            s = d / (1 - Math.abs(2 * l - 1));

            if (max === r) {
                h = 60 * (((g - b) / d) % 6);
            } else if (max === g) {
                h = 60 * (((b - r) / d) + 2);
            } else {
                h = 60 * (((r - g) / d) + 4);
            }
        }

        return {
            h: (h + 360) % 360,
            s: s * 100,
            l: l * 100,
        };
    }

    function normalizeUint32(value, fallback) {
        const parsed = Number(value);

        if (!Number.isFinite(parsed)) {
            return fallback >>> 0;
        }

        return (Math.floor(parsed) >>> 0);
    }

    function cloneRippleState(ripple, fallbackX, fallbackY) {
        return {
            x: clampNumber(ripple && ripple.x, fallbackX, -100000, 100000),
            y: clampNumber(ripple && ripple.y, fallbackY, -100000, 100000),
            radius: clampNumber(ripple && ripple.radius, 0, 0, 100000),
            rotation: clampNumber(ripple && ripple.rotation, 0, -100000, 100000),
            spin: clampNumber(ripple && ripple.spin, 1, -1, 1) < 0 ? -1 : 1,
            hue: clampNumber(ripple && ripple.hue, 0, 0, 360),
            saturation: clampNumber(ripple && ripple.saturation, 0, 0, 100),
            lightness: clampNumber(ripple && ripple.lightness, 0, 0, 100),
            alpha: clampNumber(ripple && ripple.alpha, 0.78, 0, 1),
        };
    }

    function interpolateNumber(start, end, t) {
        return start + (end - start) * t;
    }

    function interpolateAngle(start, end, t) {
        const delta = ((((end - start) % (Math.PI * 2)) + (Math.PI * 3)) % (Math.PI * 2)) - Math.PI;

        return start + delta * t;
    }

    function interpolateRippleState(startRipple, targetRipple, fallbackX, fallbackY, t) {
        const start = cloneRippleState(startRipple, fallbackX, fallbackY);
        const target = cloneRippleState(targetRipple, fallbackX, fallbackY);

        return {
            x: interpolateNumber(start.x, target.x, t),
            y: interpolateNumber(start.y, target.y, t),
            radius: interpolateNumber(start.radius, target.radius, t),
            rotation: interpolateAngle(start.rotation, target.rotation, t),
            spin: t < 0.5 ? start.spin : target.spin,
            hue: interpolateNumber(start.hue, target.hue, t),
            saturation: interpolateNumber(start.saturation, target.saturation, t),
            lightness: interpolateNumber(start.lightness, target.lightness, t),
            alpha: interpolateNumber(start.alpha, target.alpha, t),
        };
    }

    function normalizePulseState(pulse) {
        return {
            id: pulse && pulse.id ? String(pulse.id) : null,
            type: pulse && pulse.type ? String(pulse.type) : 'tap_pulse',
            x: clampNumber(pulse && pulse.x, 0, 0, DEFAULT_CONFIG.virtualWidth - 1),
            y: clampNumber(pulse && pulse.y, 0, 0, DEFAULT_CONFIG.virtualHeight - 1),
            color: /^#[0-9a-f]{6}$/i.test(String(pulse && pulse.color || '')) ? pulse.color : '#ff3366',
            strength: clampNumber(pulse && pulse.strength, 1, 0.1, 2),
            ttl_ms: clampNumber(pulse && pulse.ttl_ms, 4000, 500, 15000),
            created_at_engine_ms: clampNumber(pulse && pulse.created_at_engine_ms, 0, 0, 1000000000),
        };
    }

    function interpolatePulseState(startPulse, targetPulse, t) {
        const start = normalizePulseState(startPulse);
        const target = normalizePulseState(targetPulse);

        return {
            id: target.id || start.id,
            type: target.type || start.type,
            x: interpolateNumber(start.x, target.x, t),
            y: interpolateNumber(start.y, target.y, t),
            color: t < 0.5 ? start.color : target.color,
            strength: interpolateNumber(start.strength, target.strength, t),
            ttl_ms: interpolateNumber(start.ttl_ms, target.ttl_ms, t),
            created_at_engine_ms: interpolateNumber(start.created_at_engine_ms, target.created_at_engine_ms, t),
        };
    }

    function createRippleEngine(initialConfig) {
        let config = normalizeConfig(initialConfig);
        let spawnTimer = 0;
        let spawnCount = 0;
        let engineTimeMs = 0;
        let rngState = normalizeUint32(config.seed, 0x6d2b79f5);
        let randomIndex = 0;
        const ripples = [];
        const eventPulses = [];
        const seenEventIds = new Set();

        function spawnIntervalSeconds() {
            const fastness = config.interval / 10;
            const base = 4.35 - fastness * 4.15;
            return Math.max(0.08, base);
        }

        function nextRandom() {
            rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
            randomIndex += 1;

            return rngState / UINT32_MAX;
        }

        function spawnRipple() {
            const baseColor = hexToHsl(config.rippleColor);
            const variationRatio = config.colorVariation / 10;
            const hueShift = variationRatio >= 1
                ? nextRandom() * 360 - 180
                : (nextRandom() * 2 - 1) * variationRatio * 180;
            const saturationShift = (nextRandom() * 2 - 1) * variationRatio * 24;
            const lightnessShift = (nextRandom() * 2 - 1) * variationRatio * 14;
            const isDark = spawnCount % 2 === 1;

            ripples.push({
                x: config.virtualWidth * (config.originX / 100),
                y: config.virtualHeight * (config.originY / 100),
                radius: 0,
                rotation: nextRandom() * Math.PI * 2,
                spin: nextRandom() > 0.5 ? 1 : -1,
                hue: isDark ? 0 : (baseColor.h + hueShift + 360) % 360,
                saturation: isDark ? 0 : Math.max(20, Math.min(100, baseColor.s + saturationShift)),
                lightness: isDark ? 0 : Math.max(18, Math.min(80, baseColor.l + lightnessShift)),
                alpha: isDark ? 1 : 0.78,
            });

            spawnCount += 1;
        }

        function updateRipples(deltaSeconds) {
            spawnTimer -= deltaSeconds;

            if (spawnTimer <= 0) {
                spawnRipple();
                const randomness = (nextRandom() * 2 - 1) * (config.intervalRandomness / 10) * spawnIntervalSeconds() * 0.8;
                spawnTimer = Math.max(0.05, spawnIntervalSeconds() + randomness);
            }

            const speedPixels = 0.6 + config.speed * 14;
            const maxRadius = Math.hypot(config.virtualWidth, config.virtualHeight) * 1.25;

            for (let i = ripples.length - 1; i >= 0; i -= 1) {
                ripples[i].radius += speedPixels * deltaSeconds;

                if (ripples[i].radius > maxRadius) {
                    ripples.splice(i, 1);
                }
            }
        }

        function drawRipple(ctx, ripple) {
            const thickness = 1 + (config.thickness - 1) * 2.2;
            const blur = (10 - config.sharpness) * 2.4;
            const rotation = ripple.rotation + ripple.radius * 0.01 * (config.speed * 0.2) * ripple.spin;
            const useSolidFill = config.solidShapes && config.shape !== 'spiral';
            const color = 'hsla(' + ripple.hue + ', ' + ripple.saturation + '%, ' + ripple.lightness + '%, ' + Math.min(1, ripple.alpha ?? 0.78) + ')';

            ctx.save();
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = thickness;
            ctx.filter = 'blur(' + blur.toFixed(2) + 'px)';
            ctx.translate(ripple.x, ripple.y);
            ctx.rotate(rotation);

            if (config.shape === 'square') {
                const side = ripple.radius * Math.sqrt(2);
                useSolidFill ? ctx.fillRect(-side / 2, -side / 2, side, side) : ctx.strokeRect(-side / 2, -side / 2, side, side);
            } else if (config.shape === 'spiral') {
                const spiralGap = thickness * 1.6 + 10;
                const radialStep = spiralGap / (Math.PI * 2);
                const spiralLength = Math.max(80, ripple.radius * 0.42);
                const innerRadius = Math.max(0, ripple.radius - spiralLength);
                const startAngle = innerRadius / Math.max(radialStep, 0.0001);
                const maxAngle = Math.max(startAngle + Math.PI * 2, ripple.radius / Math.max(radialStep, 0.0001));
                const step = 0.14;
                ctx.beginPath();

                for (let angle = startAngle; angle <= maxAngle; angle += step) {
                    const radius = radialStep * angle;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;

                    if (angle === startAngle) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }

                ctx.stroke();
            } else if (config.shape === 'triangle') {
                const size = ripple.radius * 1.9;
                const height = size * 0.8660254;
                ctx.beginPath();
                ctx.moveTo(0, -height / 2);
                ctx.lineTo(-size / 2, height / 2);
                ctx.lineTo(size / 2, height / 2);
                ctx.closePath();
                useSolidFill ? ctx.fill() : ctx.stroke();
            } else if (config.shape === 'rectangle') {
                const rectHeight = ripple.radius * 1.25;
                const rectWidth = rectHeight * 1.68;
                useSolidFill ? ctx.fillRect(-rectWidth / 2, -rectHeight / 2, rectWidth, rectHeight) : ctx.strokeRect(-rectWidth / 2, -rectHeight / 2, rectWidth, rectHeight);
            } else if (config.shape === 'hexagon') {
                const hexRadius = ripple.radius;
                ctx.beginPath();
                for (let side = 0; side < 6; side += 1) {
                    const angle = (Math.PI / 3) * side - Math.PI / 2;
                    const x = Math.cos(angle) * hexRadius;
                    const y = Math.sin(angle) * hexRadius;

                    if (side === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.closePath();
                useSolidFill ? ctx.fill() : ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, ripple.radius, 0, Math.PI * 2);
                useSolidFill ? ctx.fill() : ctx.stroke();
            }

            ctx.restore();
        }

        function normalizeEventPulse(event) {
            const createdAt = Number(event.created_at_ms);
            const ttl = Number(event.ttl_ms);
            const x = Number(event.x);
            const y = Number(event.y);

            if (!Number.isFinite(createdAt) || !Number.isFinite(ttl) || !Number.isFinite(x) || !Number.isFinite(y)) {
                return null;
            }

            return {
                id: event.id ? String(event.id) : null,
                type: event.type || 'tap_pulse',
                x,
                y,
                color: /^#[0-9a-f]{6}$/i.test(String(event.color || '')) ? event.color : '#ff3366',
                strength: clampNumber(event.strength, 1, 0.1, 2),
                createdAtMs: engineTimeMs,
                ttl: clampNumber(ttl, 4000, 500, 15000),
            };
        }

        function addEvents(events) {
            if (!Array.isArray(events)) {
                return;
            }

            events.forEach((event) => {
                const pulse = normalizeEventPulse(event || {});

                if (!pulse || pulse.type !== 'tap_pulse') {
                    return;
                }

                if (pulse.id && seenEventIds.has(pulse.id)) {
                    return;
                }

                if (pulse.id) {
                    seenEventIds.add(pulse.id);
                }

                eventPulses.push(pulse);
            });
        }

        function drawEventPulses(ctx) {
            const maxRadius = Math.hypot(config.virtualWidth, config.virtualHeight) * 0.32;

            for (let i = eventPulses.length - 1; i >= 0; i -= 1) {
                const pulse = eventPulses[i];
                const age = engineTimeMs - pulse.createdAtMs;
                const progress = age / pulse.ttl;

                if (progress < 0 || progress > 1) {
                    if (progress > 1) {
                        eventPulses.splice(i, 1);
                    }
                    continue;
                }

                const x = (pulse.x / DEFAULT_CONFIG.virtualWidth) * config.virtualWidth;
                const y = (pulse.y / DEFAULT_CONFIG.virtualHeight) * config.virtualHeight;
                const radius = 3 + progress * maxRadius;
                const alpha = (1 - progress) * 0.95 * pulse.strength;
                const lineWidth = Math.max(2, config.thickness * 0.72);

                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                ctx.strokeStyle = pulse.color;
                ctx.fillStyle = pulse.color;
                ctx.globalAlpha = Math.min(1, alpha * 0.2);
                ctx.beginPath();
                ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = Math.min(1, alpha);
                ctx.lineWidth = lineWidth;
                ctx.filter = 'blur(' + Math.max(0, (10 - config.sharpness) * 0.6).toFixed(2) + 'px)';
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        function render(ctx, deltaSeconds) {
            engineTimeMs += deltaSeconds * 1000;
            ctx.clearRect(0, 0, config.virtualWidth, config.virtualHeight);
            ctx.fillStyle = config.backgroundColor || '#000000';
            ctx.fillRect(0, 0, config.virtualWidth, config.virtualHeight);

            if (config.type !== 'ripples') {
                return;
            }

            updateRipples(deltaSeconds);
            ripples.forEach((ripple) => drawRipple(ctx, ripple));
            drawEventPulses(ctx);
        }

        function setConfig(nextConfig) {
            const previousWidth = config.virtualWidth;
            const previousHeight = config.virtualHeight;
            config = normalizeConfig(nextConfig);

            if (previousWidth !== config.virtualWidth || previousHeight !== config.virtualHeight) {
                ripples.length = 0;
                eventPulses.length = 0;
                seenEventIds.clear();
                spawnTimer = 0;
                spawnCount = 0;
                engineTimeMs = 0;
            }
        }

        function getEngineState() {
            return {
                engine_time_ms: Math.max(0, Math.round(engineTimeMs)),
                rng_state: rngState >>> 0,
                random_index: randomIndex,
                spawn_timer_ms: Math.max(0, Math.round(spawnTimer * 1000)),
                spawn_count: spawnCount,
                ripples: ripples.map((ripple) => cloneRippleState(
                    ripple,
                    config.virtualWidth * (config.originX / 100),
                    config.virtualHeight * (config.originY / 100),
                )),
                event_pulses: eventPulses.map((pulse) => ({
                    ...normalizePulseState({
                        id: pulse.id,
                        type: pulse.type,
                        x: pulse.x,
                        y: pulse.y,
                        color: pulse.color,
                        strength: pulse.strength,
                        ttl_ms: pulse.ttl,
                        created_at_engine_ms: pulse.createdAtMs,
                    }),
                })),
                seen_event_ids: Array.from(seenEventIds),
                active_auto_pulses: [],
            };
        }

        function applyEngineState(nextState, options) {
            if (!nextState || typeof nextState !== 'object') {
                return;
            }

            const elapsedMs = clampNumber(options && options.elapsedMs, 0, 0, 60000);

            engineTimeMs = clampNumber(nextState.engine_time_ms, 0, 0, 1000000000) + elapsedMs;
            rngState = normalizeUint32(nextState.rng_state, rngState || 0x6d2b79f5);
            randomIndex = Math.max(0, Math.round(clampNumber(nextState.random_index, 0, 0, 1000000000)));
            spawnTimer = Math.max(
                0,
                (clampNumber(nextState.spawn_timer_ms, spawnIntervalSeconds() * 1000, 0, 1000000000) - elapsedMs) / 1000,
            );
            spawnCount = Math.max(0, Math.round(clampNumber(nextState.spawn_count, 0, 0, 1000000000)));

            ripples.length = 0;
            if (Array.isArray(nextState.ripples)) {
                nextState.ripples.forEach((ripple) => {
                    ripples.push(cloneRippleState(
                        ripple,
                        config.virtualWidth * (config.originX / 100),
                        config.virtualHeight * (config.originY / 100),
                    ));
                });
            }

            eventPulses.length = 0;
            if (Array.isArray(nextState.event_pulses)) {
                nextState.event_pulses.forEach((pulse) => {
                    eventPulses.push({
                        ...normalizePulseState(pulse),
                        ttl: clampNumber(pulse && pulse.ttl_ms, 4000, 500, 15000),
                        createdAtMs: clampNumber(pulse && pulse.created_at_engine_ms, 0, 0, 1000000000),
                    });
                });
            }

            seenEventIds.clear();
            if (Array.isArray(nextState.seen_event_ids)) {
                nextState.seen_event_ids.forEach((id) => {
                    if (id !== null && id !== undefined && id !== '') {
                        seenEventIds.add(String(id));
                    }
                });
            }
        }

        spawnRipple();
        spawnTimer = spawnIntervalSeconds();

        return {
            addEvents,
            applyEngineState,
            getConfig: () => ({ ...config }),
            getEngineState,
            setConfig,
            render,
        };
    }

    function buildPixelblasterFrame(virtualCanvas, outputCanvas, config) {
        const normalized = normalizeConfig(config);
        const vctx = virtualCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
        const octx = outputCanvas.getContext('2d', { alpha: false });
        const src = vctx.getImageData(0, 0, normalized.virtualWidth, normalized.virtualHeight);
        const dst = octx.createImageData(normalized.outputWidth, normalized.outputHeight);
        const xLimit = Math.min(normalized.outputWidth, normalized.virtualWidth);
        const yScale = normalized.verticalScale || (normalized.virtualHeight / normalized.outputHeight);

        for (let y = 0; y < normalized.outputHeight; y += 1) {
            const sourceStart = Math.max(0, Math.floor(y * yScale));
            const sourceEnd = Math.max(sourceStart + 1, Math.min(normalized.virtualHeight, Math.ceil((y + 1) * yScale)));

            for (let x = 0; x < xLimit; x += 1) {
                const dstIndex = (y * normalized.outputWidth + x) * 4;
                let redTotal = 0;
                let greenTotal = 0;
                let blueTotal = 0;
                let sampleCount = 0;

                for (let sy = sourceStart; sy < sourceEnd; sy += 1) {
                    const srcIndex = (sy * normalized.virtualWidth + x) * 4;

                    redTotal += src.data[srcIndex + 0];
                    greenTotal += src.data[srcIndex + 1];
                    blueTotal += src.data[srcIndex + 2];
                    sampleCount += 1;
                }

                dst.data[dstIndex + 0] = Math.round(redTotal / sampleCount);
                dst.data[dstIndex + 1] = Math.round(greenTotal / sampleCount);
                dst.data[dstIndex + 2] = Math.round(blueTotal / sampleCount);
                dst.data[dstIndex + 3] = 255;
            }
        }

        octx.putImageData(dst, 0, 0);
    }

    function createCanvasRunner(options) {
        const canvas = options.canvas;
        const ctx = canvas.getContext('2d', { alpha: options.alpha !== false });
        const engine = createRippleEngine(options.config || DEFAULT_CONFIG);
        let mode = options.mode || 'preview';
        let lastFrame = 0;
        let rafId = 0;
        let destroyed = false;
        let config = engine.getConfig();
        let snapshotTransition = null;
        const virtualCanvas = document.createElement('canvas');
        const virtualCtx = virtualCanvas.getContext('2d', { alpha: false, willReadFrequently: true });

        function resizePreview() {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.max(1, Math.round(rect.width));
            const height = Math.max(1, Math.round(rect.height));
            const scaleX = width / Math.max(1, config.virtualWidth);
            const scaleY = height / Math.max(1, config.virtualHeight);

            canvas.width = Math.max(1, Math.round(rect.width * dpr));
            canvas.height = Math.max(1, Math.round(rect.height * dpr));
            ctx.setTransform(dpr * scaleX, 0, 0, dpr * scaleY, 0, 0);
        }

        function resizeOutput() {
            config = engine.getConfig();
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

        function applyEngineState(nextState, options) {
            engine.applyEngineState(nextState, options);
        }

        function applySnapshot(snapshot) {
            if (!snapshot || typeof snapshot !== 'object') {
                return;
            }

            const elapsedMs = Math.max(0, Date.now() - clampNumber(snapshot.snapshot_at_ms, Date.now(), 0, 10000000000000));
            const transitionMs = Math.max(0, Math.round(clampNumber(options.snapshotTransitionMs, mode === 'preview' ? 160 : 0, 0, 5000)));

            if (snapshot.config && typeof snapshot.config === 'object') {
                applyConfig(snapshot.config);
            }

            if (snapshot.engine && typeof snapshot.engine === 'object') {
                if (transitionMs > 0) {
                    snapshotTransition = {
                        startedAt: performance.now(),
                        durationMs: transitionMs,
                        startState: engine.getEngineState(),
                        targetState: snapshot.engine,
                        elapsedMs,
                    };

                    return;
                }

                applyEngineState(snapshot.engine, { elapsedMs });
            }
        }

        function buildInterpolatedEngineState(startState, targetState, elapsedMs, progress) {
            const fallbackX = config.virtualWidth * (config.originX / 100);
            const fallbackY = config.virtualHeight * (config.originY / 100);
            const targetEngineTime = clampNumber(targetState && targetState.engine_time_ms, 0, 0, 1000000000) + elapsedMs;
            const targetSpawnTimer = Math.max(
                0,
                clampNumber(targetState && targetState.spawn_timer_ms, 0, 0, 1000000000) - elapsedMs,
            );
            const startRipples = Array.isArray(startState && startState.ripples) ? startState.ripples : [];
            const targetRipples = Array.isArray(targetState && targetState.ripples) ? targetState.ripples : [];
            const rippleCount = Math.max(startRipples.length, targetRipples.length);
            const ripples = [];

            for (let index = 0; index < rippleCount; index += 1) {
                const startRipple = startRipples[index] || targetRipples[index];
                const targetRipple = targetRipples[index] || startRipples[index];

                if (!startRipple && !targetRipple) {
                    continue;
                }

                ripples.push(interpolateRippleState(startRipple, targetRipple, fallbackX, fallbackY, progress));
            }

            const startPulses = Array.isArray(startState && startState.event_pulses) ? startState.event_pulses : [];
            const targetPulses = Array.isArray(targetState && targetState.event_pulses) ? targetState.event_pulses : [];
            const pulseCount = Math.max(startPulses.length, targetPulses.length);
            const eventPulses = [];

            for (let index = 0; index < pulseCount; index += 1) {
                const startPulse = startPulses[index] || targetPulses[index];
                const targetPulse = targetPulses[index] || startPulses[index];

                if (!startPulse && !targetPulse) {
                    continue;
                }

                eventPulses.push(interpolatePulseState(startPulse, targetPulse, progress));
            }

            return {
                engine_time_ms: interpolateNumber(
                    clampNumber(startState && startState.engine_time_ms, 0, 0, 1000000000),
                    targetEngineTime,
                    progress,
                ),
                rng_state: progress < 1 ? normalizeUint32(startState && startState.rng_state, 0x6d2b79f5) : normalizeUint32(targetState && targetState.rng_state, 0x6d2b79f5),
                random_index: Math.round(interpolateNumber(
                    clampNumber(startState && startState.random_index, 0, 0, 1000000000),
                    clampNumber(targetState && targetState.random_index, 0, 0, 1000000000),
                    progress,
                )),
                spawn_timer_ms: interpolateNumber(
                    clampNumber(startState && startState.spawn_timer_ms, 0, 0, 1000000000),
                    targetSpawnTimer,
                    progress,
                ),
                spawn_count: Math.round(interpolateNumber(
                    clampNumber(startState && startState.spawn_count, 0, 0, 1000000000),
                    clampNumber(targetState && targetState.spawn_count, 0, 0, 1000000000),
                    progress,
                )),
                ripples,
                event_pulses: eventPulses,
                seen_event_ids: progress < 1
                    ? (Array.isArray(startState && startState.seen_event_ids) ? startState.seen_event_ids : [])
                    : (Array.isArray(targetState && targetState.seen_event_ids) ? targetState.seen_event_ids : []),
            };
        }

        function renderFrame(now) {
            if (!lastFrame) {
                lastFrame = now;
            }

            const deltaSeconds = Math.min(0.05, (now - lastFrame) * 0.001);
            lastFrame = now;

            if (snapshotTransition) {
                const progress = Math.min(1, Math.max(0, (now - snapshotTransition.startedAt) / Math.max(1, snapshotTransition.durationMs)));

                if (progress >= 1) {
                    applyEngineState(snapshotTransition.targetState, { elapsedMs: snapshotTransition.elapsedMs });
                    snapshotTransition = null;
                } else {
                    applyEngineState(
                        buildInterpolatedEngineState(
                            snapshotTransition.startState,
                            snapshotTransition.targetState,
                            snapshotTransition.elapsedMs,
                            progress,
                        ),
                        { elapsedMs: 0 },
                    );
                }
            }

            if (mode === 'preview') {
                engine.render(ctx, snapshotTransition ? 0 : deltaSeconds);
            } else {
                engine.render(virtualCtx, deltaSeconds);
                buildPixelblasterFrame(virtualCanvas, canvas, config);
            }

            if (!destroyed) {
                rafId = window.requestAnimationFrame(renderFrame);
            }
        }

        function start() {
            destroyed = false;
            if (mode === 'preview') {
                resizePreview();
                window.addEventListener('resize', resizePreview);
            } else {
                resizeOutput();
            }
            rafId = window.requestAnimationFrame(renderFrame);
        }

        function destroy() {
            destroyed = true;
            window.cancelAnimationFrame(rafId);
            window.removeEventListener('resize', resizePreview);
        }

        function getSnapshot() {
            return {
                snapshot_at_ms: Date.now(),
                config: { ...config },
                engine: engine.getEngineState(),
            };
        }

        return {
            addEvents: (events) => engine.addEvents(events),
            applyConfig,
            applyEngineState,
            applySnapshot,
            destroy,
            getConfig: () => ({ ...config }),
            getSnapshot,
            start,
        };
    }

    window.CaliondaRipples = {
        DEFAULT_CONFIG,
        buildPixelblasterFrame,
        createCanvasRunner,
        createRippleEngine,
        normalizeConfig,
    };
}());

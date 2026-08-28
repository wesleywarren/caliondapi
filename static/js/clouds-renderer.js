(function () {
    const DEFAULT_CONFIG = {
        type: "clouds",
        backgroundTop: "#07111d",
        backgroundMid: "#0f2740",
        backgroundBottom: "#040a10",
        palette: [
            { hue: 178, saturation: 88, lightness: 68, alpha: 0.22, radius: 0.28 },
            { hue: 194, saturation: 86, lightness: 62, alpha: 0.18, radius: 0.26 },
            { hue: 214, saturation: 84, lightness: 60, alpha: 0.20, radius: 0.31 },
            { hue: 240, saturation: 82, lightness: 58, alpha: 0.17, radius: 0.24 },
            { hue: 258, saturation: 80, lightness: 56, alpha: 0.13, radius: 0.22 },
            { hue: 153, saturation: 78, lightness: 58, alpha: 0.15, radius: 0.20 },
            { hue: 186, saturation: 90, lightness: 66, alpha: 0.21, radius: 0.27 },
            { hue: 205, saturation: 86, lightness: 57, alpha: 0.16, radius: 0.23 }
        ],
        pointCount: 7,
        speed: 0.7,
        drift: 0.72,
        horizontalMovement: 0.27,
        verticalMovement: 0.28,
        horizontalFlow: 0,
        verticalFlow: 0,
        avoidanceDistance: 0.06,
        bloom: 42,
        saturation: 1.22,
        vignette: 0.2,
        virtualWidth: 255,
        virtualHeight: 360,
        outputWidth: 255,
        outputHeight: 36,
        verticalScale: 10,
        cropX: 50,
        cropY: 50
    };

    function clampNumber(value, fallback, min, max) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return fallback;
        }

        return Math.max(min, Math.min(max, parsed));
    }

    function normalizePoint(point, fallback) {
        const merged = {
            ...(fallback || {}),
            ...(point || {})
        };

        return {
            hue: clampNumber(merged.hue, 194, 0, 360),
            saturation: clampNumber(merged.saturation, 84, 0, 100),
            lightness: clampNumber(merged.lightness, 60, 0, 80),
            alpha: clampNumber(merged.alpha, 0.18, 0.02, 0.9),
            radius: clampNumber(merged.radius, 0.24, 0.08, 0.75)
        };
    }

    function normalizeConfig(nextConfig) {
        const merged = {
            ...DEFAULT_CONFIG,
            ...(nextConfig || {})
        };
        const palette = Array.isArray(merged.palette) && merged.palette.length ? merged.palette : DEFAULT_CONFIG.palette;

        return {
            ...merged,
            type: "clouds",
            backgroundTop: /^#[0-9a-f]{6}$/i.test(String(merged.backgroundTop || "")) ? merged.backgroundTop : DEFAULT_CONFIG.backgroundTop,
            backgroundMid: /^#[0-9a-f]{6}$/i.test(String(merged.backgroundMid || "")) ? merged.backgroundMid : DEFAULT_CONFIG.backgroundMid,
            backgroundBottom: /^#[0-9a-f]{6}$/i.test(String(merged.backgroundBottom || "")) ? merged.backgroundBottom : DEFAULT_CONFIG.backgroundBottom,
            pointCount: Math.round(clampNumber(merged.pointCount, DEFAULT_CONFIG.pointCount, 1, 8)),
            speed: clampNumber(merged.speed, DEFAULT_CONFIG.speed, -2, 2),
            drift: clampNumber(merged.drift, DEFAULT_CONFIG.drift, 0, 2),
            horizontalMovement: clampNumber(merged.horizontalMovement, DEFAULT_CONFIG.horizontalMovement, 0, 1),
            verticalMovement: clampNumber(merged.verticalMovement, DEFAULT_CONFIG.verticalMovement, 0, 1),
            horizontalFlow: clampNumber(merged.horizontalFlow, DEFAULT_CONFIG.horizontalFlow, -1, 1),
            verticalFlow: clampNumber(merged.verticalFlow, DEFAULT_CONFIG.verticalFlow, -1, 1),
            avoidanceDistance: clampNumber(merged.avoidanceDistance, DEFAULT_CONFIG.avoidanceDistance, 0, 0.3),
            bloom: clampNumber(merged.bloom, DEFAULT_CONFIG.bloom, 0, 80),
            saturation: clampNumber(merged.saturation, DEFAULT_CONFIG.saturation, 0.4, 2),
            vignette: clampNumber(merged.vignette, DEFAULT_CONFIG.vignette, 0, 0.6),
            virtualWidth: Math.max(1, Math.round(clampNumber(merged.virtualWidth, DEFAULT_CONFIG.virtualWidth, 1, 4096))),
            virtualHeight: Math.max(1, Math.round(clampNumber(merged.virtualHeight, DEFAULT_CONFIG.virtualHeight, 1, 4096))),
            outputWidth: Math.max(1, Math.round(clampNumber(merged.outputWidth, DEFAULT_CONFIG.outputWidth, 1, 4096))),
            outputHeight: Math.max(1, Math.round(clampNumber(merged.outputHeight, DEFAULT_CONFIG.outputHeight, 1, 4096))),
            verticalScale: clampNumber(merged.verticalScale, DEFAULT_CONFIG.verticalScale, 0.001, 1000),
            cropX: Math.round(clampNumber(merged.cropX, DEFAULT_CONFIG.cropX, -10000, 10000)),
            cropY: Math.round(clampNumber(merged.cropY, DEFAULT_CONFIG.cropY, -10000, 10000)),
            palette: Array.from({ length: 8 }, function (_, index) {
                return normalizePoint(palette[index], DEFAULT_CONFIG.palette[index % DEFAULT_CONFIG.palette.length]);
            })
        };
    }

    function wrapRange(value, min, max) {
        const range = max - min;
        if (range <= 0) {
            return value;
        }

        return ((((value - min) % range) + range) % range) + min;
    }

    function createCloudsEngine(initialConfig) {
        let config = normalizeConfig(initialConfig);
        let engineTimeMs = 0;
        let disturbances = [];

        function applyAvoidance(points, width, height, distance) {
            if (!distance || distance <= 0 || points.length < 2) {
                return;
            }

            const threshold = Math.min(width, height) * distance;
            const thresholdSquared = threshold * threshold;

            for (let i = 0; i < points.length; i += 1) {
                for (let j = i + 1; j < points.length; j += 1) {
                    const pointA = points[i];
                    const pointB = points[j];
                    const dx = pointB.x - pointA.x;
                    const dy = pointB.y - pointA.y;
                    const distanceSquared = dx * dx + dy * dy;

                    if (!distanceSquared || distanceSquared >= thresholdSquared) {
                        continue;
                    }

                    const overlap = (threshold - Math.sqrt(distanceSquared)) * 0.18;
                    if (Math.abs(dy) >= Math.abs(dx)) {
                        const horizontalDirection = dx >= 0 ? 1 : -1;
                        pointA.x = Math.max(0, Math.min(width, pointA.x - horizontalDirection * overlap));
                        pointB.x = Math.max(0, Math.min(width, pointB.x + horizontalDirection * overlap));
                    } else {
                        const verticalDirection = dy >= 0 ? 1 : -1;
                        pointA.y = Math.max(0, Math.min(height, pointA.y - verticalDirection * overlap));
                        pointB.y = Math.max(0, Math.min(height, pointB.y + verticalDirection * overlap));
                    }
                }
            }
        }

        function currentClouds() {
            return config.palette.slice(0, config.pointCount).map(function (point, index) {
                return {
                    xFreq: 0.12 + index * 0.018,
                    yFreq: 0.10 + index * 0.016,
                    xPhase: index * 1.13,
                    yPhase: index * 0.79,
                    radius: point.radius,
                    alpha: point.alpha,
                    hue: point.hue,
                    saturation: point.saturation,
                    lightness: point.lightness
                };
            });
        }

        function addEvents(events) {
            if (!Array.isArray(events)) {
                return;
            }

            events.forEach(function (event) {
                const x = clampNumber(event && event.x, config.virtualWidth / 2, 0, config.virtualWidth);
                const y = clampNumber(event && event.y, config.virtualHeight / 2, 0, config.virtualHeight);
                disturbances.push({
                    x: (x / 255) * config.virtualWidth,
                    y: (y / 360) * config.virtualHeight,
                    strength: clampNumber(event && event.strength, 1, 0.1, 2),
                    createdAtMs: engineTimeMs,
                    ttlMs: clampNumber(event && event.ttl_ms, 3200, 500, 12000)
                });
            });
        }

        function fillBackdrop(ctx, width, height, timeSeconds) {
            const gradient = ctx.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, config.backgroundTop);
            gradient.addColorStop(0.42, config.backgroundMid);
            gradient.addColorStop(1, config.backgroundBottom);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            const halo = ctx.createRadialGradient(
                width * (0.36 + Math.sin(timeSeconds * 0.11) * 0.05),
                height * (0.28 + Math.cos(timeSeconds * 0.09) * 0.03),
                width * 0.04,
                width * 0.42,
                height * 0.32,
                width * 0.9
            );
            halo.addColorStop(0, "rgba(134, 225, 255, 0.18)");
            halo.addColorStop(0.42, "rgba(118, 121, 255, 0.11)");
            halo.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.fillStyle = halo;
            ctx.fillRect(0, 0, width, height);
        }

        function drawClouds(ctx, width, height, timeSeconds) {
            ctx.save();
            ctx.globalCompositeOperation = "screen";

            const clouds = currentClouds();
            const wrapInset = 0.25;
            const wrapMinX = -width * wrapInset;
            const wrapMaxX = width * (1 + wrapInset);
            const wrapMinY = -height * wrapInset;
            const wrapMaxY = height * (1 + wrapInset);
            const flowScale = 0.35;

            const positions = clouds.map(function (cloud, index) {
                const xWave = Math.sin(timeSeconds * cloud.xFreq * config.speed + cloud.xPhase) * config.horizontalMovement;
                const yWave = Math.cos(timeSeconds * cloud.yFreq * config.speed + cloud.yPhase) * config.verticalMovement;
                const xSecondary = Math.cos(timeSeconds * 0.05 + index) * 0.05 * config.drift * Math.max(config.horizontalMovement, 0.01);
                const ySecondary = Math.sin(timeSeconds * 0.04 + index * 0.4) * 0.03 * config.drift * Math.max(config.verticalMovement, 0.01);
                const baseX = width * (0.5 + xWave + xSecondary);
                const baseY = height * (0.5 + yWave + ySecondary);
                const flowOffsetX = config.horizontalFlow * timeSeconds * width * flowScale + index * width * 0.14;
                const flowOffsetY = config.verticalFlow * timeSeconds * height * flowScale + index * height * 0.12;

                return {
                    x: wrapRange(baseX + flowOffsetX, wrapMinX, wrapMaxX),
                    y: wrapRange(baseY + flowOffsetY, wrapMinY, wrapMaxY)
                };
            });

            applyAvoidance(positions, width, height, config.avoidanceDistance);

            clouds.forEach(function (cloud, index) {
                const position = positions[index];
                const radius = Math.min(width, height) * cloud.radius;
                const gradient = ctx.createRadialGradient(position.x, position.y, radius * 0.08, position.x, position.y, radius);
                gradient.addColorStop(0, "hsla(" + cloud.hue + ", " + cloud.saturation + "%, " + cloud.lightness + "%, " + cloud.alpha + ")");
                gradient.addColorStop(0.42, "hsla(" + (cloud.hue + 20) + ", " + Math.max(0, cloud.saturation - 4) + "%, " + Math.max(0, cloud.lightness - 12) + "%, " + (cloud.alpha * 0.72) + ")");
                gradient.addColorStop(0.76, "hsla(" + (cloud.hue - 18) + ", " + Math.max(0, cloud.saturation - 14) + "%, " + Math.max(0, cloud.lightness - 22) + "%, " + (cloud.alpha * 0.28) + ")");
                gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.restore();
        }

        function drawDisturbances(ctx) {
            for (let index = disturbances.length - 1; index >= 0; index -= 1) {
                const disturbance = disturbances[index];
                const ageMs = engineTimeMs - disturbance.createdAtMs;
                const progress = ageMs / disturbance.ttlMs;

                if (progress >= 1) {
                    disturbances.splice(index, 1);
                    continue;
                }

                const radius = 12 + progress * (config.virtualWidth * 0.38) * disturbance.strength;
                const alpha = Math.max(0, 0.5 * (1 - progress));
                const gradient = ctx.createRadialGradient(disturbance.x, disturbance.y, radius * 0.1, disturbance.x, disturbance.y, radius);
                gradient.addColorStop(0, "rgba(255,255,255,0.26)");
                gradient.addColorStop(0.45, "rgba(157, 231, 255, " + alpha + ")");
                gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
                ctx.save();
                ctx.globalCompositeOperation = "screen";
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(disturbance.x, disturbance.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        function drawVignette(ctx, width, height) {
            const vignette = ctx.createRadialGradient(
                width * 0.5,
                height * 0.5,
                Math.min(width, height) * 0.2,
                width * 0.5,
                height * 0.5,
                Math.max(width, height) * 0.72
            );
            vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
            vignette.addColorStop(1, "rgba(0, 0, 0, " + config.vignette + ")");
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, width, height);
        }

        function render(ctx, deltaSeconds) {
            engineTimeMs += deltaSeconds * 1000;
            const timeSeconds = engineTimeMs * 0.001;
            fillBackdrop(ctx, config.virtualWidth, config.virtualHeight, timeSeconds);
            drawClouds(ctx, config.virtualWidth, config.virtualHeight, timeSeconds);
            drawDisturbances(ctx);
            drawVignette(ctx, config.virtualWidth, config.virtualHeight);
        }

        function setConfig(nextConfig) {
            config = normalizeConfig(nextConfig);
        }

        return {
            addEvents,
            setConfig,
            getConfig: function () {
                return { ...config, palette: config.palette.map(function (point) { return { ...point }; }) };
            },
            render
        };
    }

    function buildPixelblasterFrame(virtualCanvas, outputCanvas, config) {
        const sourceContext = virtualCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
        const outputContext = outputCanvas.getContext("2d", { alpha: false });
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
        const context = canvas.getContext("2d", { alpha: options.alpha !== false });
        const engine = createCloudsEngine(options.config || DEFAULT_CONFIG);
        const virtualCanvas = document.createElement("canvas");
        const virtualContext = virtualCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
        let config = engine.getConfig();
        let running = false;
        let frameHandle = 0;
        let lastFrameAt = performance.now();

        function resizeCanvas() {
            virtualCanvas.width = config.virtualWidth;
            virtualCanvas.height = config.virtualHeight;
            canvas.width = config.outputWidth;
            canvas.height = config.outputHeight;
        }

        function draw(now) {
            if (!running) {
                return;
            }

            const delta = Math.max(0.001, (now - lastFrameAt) / 1000);
            lastFrameAt = now;
            engine.render(virtualContext, delta);
            buildPixelblasterFrame(virtualCanvas, canvas, config);
            frameHandle = requestAnimationFrame(draw);
        }

        resizeCanvas();

        return {
            start() {
                if (running) {
                    return;
                }

                running = true;
                lastFrameAt = performance.now();
                frameHandle = requestAnimationFrame(draw);
            },
            destroy() {
                running = false;
                cancelAnimationFrame(frameHandle);
            },
            applyConfig(nextConfig) {
                config = normalizeConfig(nextConfig);
                engine.setConfig(config);
                resizeCanvas();
            },
            addEvents: engine.addEvents,
            getConfig: engine.getConfig
        };
    }

    window.CaliondaClouds = {
        DEFAULT_CONFIG,
        normalizeConfig,
        createCanvasRunner
    };
}());

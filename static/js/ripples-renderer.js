(function () {
    const DEFAULT_CONFIG = {
        type: "ripples",
        backgroundColor: "#000000",
        shape: "circle",
        originX: 60,
        originY: 33,
        rippleColor: "#5cc8ff",
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
        cropY: 50
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function hexToRgb(hex) {
        const value = String(hex || "").replace("#", "").trim();
        if (!/^[0-9a-fA-F]{6}$/.test(value)) {
            return { r: 92, g: 200, b: 255 };
        }

        return {
            r: parseInt(value.slice(0, 2), 16),
            g: parseInt(value.slice(2, 4), 16),
            b: parseInt(value.slice(4, 6), 16)
        };
    }

    function mixColor(base, amount) {
        return {
            r: clamp(Math.round(base.r + (Math.sin(amount) * 40)), 0, 255),
            g: clamp(Math.round(base.g + (Math.cos(amount * 0.7) * 40)), 0, 255),
            b: clamp(Math.round(base.b + (Math.sin(amount * 1.2) * 20)), 0, 255)
        };
    }

    function normalizeConfig(config) {
        return {
            ...DEFAULT_CONFIG,
            ...(config || {})
        };
    }

    function createCanvasRunner(options) {
        const canvas = options.canvas;
        const context = canvas.getContext("2d", { alpha: options.alpha !== false });
        let config = normalizeConfig(options.config);
        let running = false;
        let frameHandle = 0;
        let lastFrameAt = performance.now();
        let phase = 0;
        let autoPulseAt = performance.now();
        let pulses = [];
        const virtualCanvas = document.createElement("canvas");
        const virtualContext = virtualCanvas.getContext("2d", { alpha: false, willReadFrequently: true });

        function resizeCanvas() {
            virtualCanvas.width = config.virtualWidth;
            virtualCanvas.height = config.virtualHeight;
            canvas.width = config.outputWidth;
            canvas.height = config.outputHeight;
        }

        function currentOrigin() {
            return {
                x: clamp((Number(config.originX) / 100) * config.virtualWidth, 0, config.virtualWidth),
                y: clamp((Number(config.originY) / 100) * config.virtualHeight, 0, config.virtualHeight)
            };
        }

        function addPulse(pulse) {
            pulses.push({
                x: clamp(Number(pulse.x ?? currentOrigin().x), 0, config.virtualWidth),
                y: clamp(Number(pulse.y ?? currentOrigin().y), 0, config.virtualHeight),
                radius: 0,
                strength: clamp(Number(pulse.strength ?? 1), 0.1, 4),
                createdAt: performance.now()
            });
        }

        function maybeCreateAutoPulse(now) {
            const intervalMs = clamp(Number(config.interval || 5), 0.25, 60) * 1000;
            if (now - autoPulseAt < intervalMs) {
                return;
            }

            const base = currentOrigin();
            const randomness = clamp(Number(config.intervalRandomness || 0), 0, 20);
            const offsetX = (Math.random() - 0.5) * randomness * 6;
            const offsetY = (Math.random() - 0.5) * randomness * 0.8;

            addPulse({
                x: base.x + offsetX,
                y: base.y + offsetY,
                strength: 1 + (Math.random() * 0.25)
            });

            autoPulseAt = now;
        }

        function draw(now) {
            if (!running) {
                return;
            }

            const delta = Math.max(0.001, (now - lastFrameAt) / 1000);
            lastFrameAt = now;
            phase += delta * Number(config.speed || DEFAULT_CONFIG.speed);
            maybeCreateAutoPulse(now);

            const bg = hexToRgb(config.backgroundColor);
            const base = hexToRgb(config.rippleColor);
            virtualContext.fillStyle = `rgb(${bg.r}, ${bg.g}, ${bg.b})`;
            virtualContext.fillRect(0, 0, virtualCanvas.width, virtualCanvas.height);

            const nextPulses = [];
            pulses.forEach((pulse, index) => {
                pulse.radius += (Number(config.speed || DEFAULT_CONFIG.speed) * 28 + pulse.strength * 3) * delta;

                const variation = Number(config.colorVariation || 0);
                const color = mixColor(base, phase + index * 0.75 + variation);
                const alpha = clamp(1 - (pulse.radius / Math.max(virtualCanvas.width, virtualCanvas.height) * 0.9), 0, 1);
                const thickness = clamp(Number(config.thickness || 4), 1, 16);

                virtualContext.lineWidth = thickness;
                virtualContext.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
                virtualContext.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.16})`;

                if (String(config.shape || "circle") === "square") {
                    const size = pulse.radius * 2;
                    const left = pulse.x - pulse.radius;
                    const top = pulse.y - pulse.radius;

                    if (config.solidShapes) {
                        virtualContext.fillRect(left, top, size, size);
                    } else {
                        virtualContext.strokeRect(left, top, size, size);
                    }
                } else {
                    virtualContext.beginPath();
                    virtualContext.arc(pulse.x, pulse.y, Math.max(0.1, pulse.radius), 0, Math.PI * 2);
                    if (config.solidShapes) {
                        virtualContext.fill();
                    } else {
                        virtualContext.stroke();
                    }
                }

                if (alpha > 0.03) {
                    nextPulses.push(pulse);
                }
            });

            pulses = nextPulses;
            buildOutputFrame();
            frameHandle = requestAnimationFrame(draw);
        }

        function buildOutputFrame() {
            const source = virtualContext.getImageData(0, 0, virtualCanvas.width, virtualCanvas.height);
            const target = context.createImageData(config.outputWidth, config.outputHeight);
            const yScale = config.verticalScale || (config.virtualHeight / config.outputHeight);

            for (let y = 0; y < config.outputHeight; y += 1) {
                const sourceY = clamp(Math.floor(y * yScale), 0, config.virtualHeight - 1);

                for (let x = 0; x < config.outputWidth; x += 1) {
                    const sourceIndex = (sourceY * config.virtualWidth + x) * 4;
                    const targetIndex = (y * config.outputWidth + x) * 4;

                    target.data[targetIndex + 0] = source.data[sourceIndex + 0];
                    target.data[targetIndex + 1] = source.data[sourceIndex + 1];
                    target.data[targetIndex + 2] = source.data[sourceIndex + 2];
                    target.data[targetIndex + 3] = 255;
                }
            }

            context.putImageData(target, 0, 0);
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
                resizeCanvas();
            },
            addEvents(events) {
                (events || []).forEach(addPulse);
            },
            getConfig() {
                return { ...config };
            },
            getSnapshot() {
                return {
                    config: { ...config },
                    engine: {
                        phase_ms: Math.round(phase * 1000),
                        pulse_count: pulses.length
                    }
                };
            }
        };
    }

    window.CaliondaRipples = {
        DEFAULT_CONFIG,
        normalizeConfig,
        createCanvasRunner
    };
}());

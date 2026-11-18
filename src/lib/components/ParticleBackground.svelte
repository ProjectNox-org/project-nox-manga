<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  /**
   * Project Nox — Cosmic Snow & Stardust Particle System
   * Canonical source: ProjectNox-org/project-nox-tracker (commit b4e66a1)
   * Optimized Canvas with render caches and reduced per-frame allocations.
   */

  // Precomputed fill caches to minimize per-frame allocations (alpha buckets 0..10)
  const FILL_CACHE_HALO: Record<number, string[]> = {
    268: Array.from({ length: 11 }, (_, i) => `hsla(268, 82%, 76%, ${((i / 10) * 0.24).toFixed(3)})`),
    242: Array.from({ length: 11 }, (_, i) => `hsla(242, 78%, 76%, ${((i / 10) * 0.22).toFixed(3)})`),
    215: Array.from({ length: 11 }, (_, i) => `rgba(226, 217, 245, ${((i / 10) * 0.24).toFixed(3)})`),
    42:  Array.from({ length: 11 }, (_, i) => `hsla(42, 75%, 68%, ${((i / 10) * 0.18).toFixed(3)})`)
  };

  const FILL_CACHE_MOTE: Record<number, string[]> = {
    268: Array.from({ length: 11 }, (_, i) => `hsla(268, 70%, 84%, ${((i / 10) * 0.82).toFixed(3)})`),
    242: Array.from({ length: 11 }, (_, i) => `hsla(242, 65%, 85%, ${((i / 10) * 0.78).toFixed(3)})`),
    215: Array.from({ length: 11 }, (_, i) => `rgba(221, 228, 240, ${((i / 10) * 0.88).toFixed(3)})`),
    42:  Array.from({ length: 11 }, (_, i) => `hsla(42, 70%, 72%, ${((i / 10) * 0.70).toFixed(3)})`)
  };

  const FILL_CACHE_STAR: Record<number, string[]> = {
    268: Array.from({ length: 11 }, (_, i) => `hsla(268, 45%, 86%, ${((i / 10) * 0.62).toFixed(3)})`),
    242: Array.from({ length: 11 }, (_, i) => `hsla(242, 42%, 86%, ${((i / 10) * 0.58).toFixed(3)})`),
    215: Array.from({ length: 11 }, (_, i) => `rgba(203, 213, 225, ${((i / 10) * 0.68).toFixed(3)})`),
    42:  Array.from({ length: 11 }, (_, i) => `hsla(42, 52%, 75%, ${((i / 10) * 0.50).toFixed(3)})`)
  };

  const FILL_CACHE_SILVER_CORE: string[] = Array.from(
    { length: 11 },
    (_, i) => `rgba(241, 245, 249, ${Math.min(1, (i / 10) * 0.96).toFixed(3)})`
  );

  interface Particle {
    x: number;
    y: number;
    radius: number;
    alpha: number;
    baseAlpha: number;
    speedY: number;
    speedX: number;
    drift: number;
    angle: number;
    angleSpeed: number;
    sway: number;
    hue: number;
    depth: number;
  }

  let canvas: HTMLCanvasElement | null = $state(null);
  let cleanupListeners: (() => void) | null = null;

  onMount(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId: number | null = null;
    let width = 0;
    let height = 0;
    let currentDpr = 1;
    let particles: Particle[] = [];
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;
    let userPaused = false;
    try {
      userPaused =
        localStorage.getItem('nox-motion') === 'paused' ||
        localStorage.getItem('nox-tracker-animations-paused') === '1';
    } catch {
      userPaused = false;
    }
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFrameTime = 0;
    let lastDrawTimestamp = 0;
    let degradedMode = false;
    let slowFrameWindow: number[] = [];
    let auraGradient: CanvasGradient | null = null;
    let auraX = -9999;
    let auraY = -9999;

    // Interactive state (mouse, passive touch, optional passive orientation)
    let pointerX = -9999;
    let pointerY = -9999;
    let pointerActive = false;
    let targetTiltX = 0;
    let currentTiltX = 0;
    let hasTiltData = false;
    let targetParallaxX = 0;
    let targetParallaxY = 0;
    let currentParallaxX = 0;
    let currentParallaxY = 0;

    function isMobile() {
      return typeof window !== 'undefined' && window.innerWidth < 768;
    }

    function isLowEndDevice() {
      if (typeof navigator === 'undefined') return false;
      const cores = (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency || 4;
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
      return cores <= 2 || memory <= 2;
    }

    function computeTargetCount(mobile: boolean, lowEnd: boolean): number {
      let base: number;
      if (mobile) {
        base = lowEnd ? 18 : 38;
      } else if (lowEnd) {
        base = 48;
      } else {
        const areaFactor = Math.min(1.2, Math.max(0.85, (width * height) / (1440 * 900)));
        base = Math.round(95 * areaFactor);
      }
      return degradedMode ? Math.max(12, Math.round(base * 0.7)) : base;
    }

    function createParticle(randomY: boolean, mobile: boolean, index = 0, total = 1): Particle {
      const rand = Math.random();
      const depth = rand < 0.42 ? 0 : rand < 0.82 ? 1 : 2;

      let radius: number;
      let baseAlpha: number;
      let baseSpeedY: number;

      if (depth === 0) {
        radius = mobile ? 0.45 + Math.random() * 0.4 : 0.5 + Math.random() * 0.5;
        baseAlpha = 0.18 + Math.random() * 0.26;
        baseSpeedY = (mobile ? 0.10 : 0.14) + Math.random() * 0.16;
      } else if (depth === 1) {
        radius = mobile ? 0.8 + Math.random() * 0.5 : 0.9 + Math.random() * 0.65;
        baseAlpha = 0.36 + Math.random() * 0.32;
        baseSpeedY = (mobile ? 0.20 : 0.26) + Math.random() * 0.28;
      } else {
        radius = mobile ? 1.15 + Math.random() * 0.55 : 1.3 + Math.random() * 0.75;
        baseAlpha = 0.58 + Math.random() * 0.34;
        baseSpeedY = (mobile ? 0.32 : 0.40) + Math.random() * 0.36;
      }

      const colorRoll = Math.random();
      const hue = colorRoll < 0.44 ? 215 : colorRoll < 0.78 ? 268 : colorRoll < 0.94 ? 242 : 42;

      const startX = total > 1 && randomY
        ? ((index / total) * width + (Math.random() - 0.5) * (width / total) * 1.6 + width) % width
        : Math.random() * width;

      return {
        x: startX,
        y: randomY ? Math.random() * height : -12 - Math.random() * 24,
        radius,
        alpha: baseAlpha,
        baseAlpha,
        speedY: baseSpeedY,
        speedX: 0,
        drift: (Math.random() - 0.5) * (depth === 0 ? 0.04 : depth === 1 ? 0.08 : 0.12),
        angle: Math.random() * Math.PI * 2,
        angleSpeed: 0.008 + Math.random() * 0.014,
        sway: (depth === 0 ? 0.10 : depth === 1 ? 0.22 : 0.36) * (0.8 + Math.random() * 0.4),
        hue,
        depth
      };
    }

    function initSize() {
      if (!canvas || !ctx) return;
      const mobile = isMobile();
      const lowEnd = isLowEndDevice();
      currentDpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * currentDpr);
      canvas.height = Math.floor(height * currentDpr);
      ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);

      const count = computeTargetCount(mobile, lowEnd);
      if (particles.length === 0 || Math.abs(particles.length - count) > 10) {
        particles = Array.from({ length: count }, (_, idx) => createParticle(true, mobile, idx, count));
      }
    }

    function renderFrame(dt = 1) {
      if (!ctx || width === 0 || height === 0) return;
      ctx.clearRect(0, 0, width, height);

      const mobile = isMobile();

      if (pointerActive && pointerX > -100 && pointerY > -100 && !mobile) {
        const auraRadius = 175;
        if (!auraGradient || auraX !== pointerX || auraY !== pointerY) {
          auraGradient = ctx.createRadialGradient(pointerX, pointerY, 0, pointerX, pointerY, auraRadius);
          auraGradient.addColorStop(0, 'rgba(139, 92, 246, 0.045)');
          auraGradient.addColorStop(0.5, 'rgba(226, 217, 245, 0.018)');
          auraGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          auraX = pointerX;
          auraY = pointerY;
        }
        ctx.fillStyle = auraGradient;
        ctx.beginPath();
        ctx.arc(pointerX, pointerY, auraRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      currentTiltX += (targetTiltX - currentTiltX) * Math.min(1, 0.06 * dt);

      if (pointerActive && pointerX > -100 && pointerY > -100) {
        const strength = mobile ? 0.010 : 0.018;
        targetParallaxX = (pointerX - width * 0.5) * strength;
        targetParallaxY = (pointerY - height * 0.5) * strength * 0.85;
      } else {
        targetParallaxX = 0;
        targetParallaxY = 0;
      }
      const lerp = Math.min(1, 0.055 * dt);
      currentParallaxX += (targetParallaxX - currentParallaxX) * lerp;
      currentParallaxY += (targetParallaxY - currentParallaxY) * lerp;

      const interactRadius = mobile ? 85 : 118;
      const interactRadiusSq = interactRadius * interactRadius;
      const velocityDecay = Math.pow(0.92, dt);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!reducedMotion && !userPaused) {
          p.y += p.speedY * dt;
          p.angle += p.angleSpeed * dt;
          p.x += (Math.sin(p.angle) * p.sway + p.drift + currentTiltX * (p.depth + 1) * 0.35) * dt;

          p.x += p.speedX * dt;
          p.speedX *= velocityDecay;

          if (pointerActive && pointerX > -100 && pointerY > -100) {
            const dx = p.x - pointerX;
            const dy = p.y - pointerY;
            const distSq = dx * dx + dy * dy;

            if (distSq < interactRadiusSq && distSq > 1) {
              const dist = Math.sqrt(distSq);
              const force = (1 - dist / interactRadius) * (p.depth === 2 ? 2.2 : p.depth === 1 ? 1.5 : 0.7) * (mobile ? 0.55 : 1);
              p.speedX += (dx / dist) * force * 0.35 * dt;
              p.y += (dy / dist) * force * 0.35 * dt;
            }
          }

          if (p.y > height + 16) {
            p.y = -12 - Math.random() * 16;
            p.x = Math.random() * width;
            p.speedX = 0;
          }
          if (p.x < -16) p.x = width + 12;
          if (p.x > width + 16) p.x = -12;

          p.alpha = p.baseAlpha * (0.85 + Math.sin(p.angle * 1.8) * 0.22);
        }

        const drawX = p.x - currentParallaxX * (p.depth + 0.5) * 0.55;
        const drawY = p.y - currentParallaxY * (p.depth + 0.5) * 0.55;
        const aIdx = Math.min(10, Math.max(0, Math.round(p.alpha * 10)));

        if (p.depth === 2) {
          ctx.beginPath();
          ctx.arc(drawX, drawY, p.radius * 2.1, 0, Math.PI * 2);
          ctx.fillStyle = FILL_CACHE_HALO[p.hue]?.[aIdx] || 'rgba(226, 217, 245, 0.16)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(drawX, drawY, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = FILL_CACHE_SILVER_CORE[aIdx] || '#f1f5f9';
          ctx.fill();
        } else if (p.depth === 1) {
          ctx.beginPath();
          ctx.arc(drawX, drawY, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = FILL_CACHE_MOTE[p.hue]?.[aIdx] || 'rgba(221, 228, 240, 0.55)';
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(drawX, drawY, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = FILL_CACHE_STAR[p.hue]?.[aIdx] || 'rgba(203, 213, 225, 0.35)';
          ctx.fill();
        }
      }
    }

    function isAnimationBlocked() {
      return reducedMotion || userPaused || document.hidden;
    }

    function stopLoop() {
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    }

    function startLoop() {
      if (isAnimationBlocked()) return;
      if (animId === null) {
        const now = performance.now();
        lastFrameTime = now;
        lastDrawTimestamp = now;
        animId = requestAnimationFrame(loop);
      }
    }

    function syncMotionClass() {
      const paused = reducedMotion || userPaused;
      document.documentElement.classList.toggle('animations-paused', paused);
    }

    function getTargetFps() {
      if (degradedMode || isMobile() || isLowEndDevice()) return 30;
      return 60;
    }

    function loop(timestamp: number) {
      if (isAnimationBlocked()) {
        animId = null;
        return;
      }

      const targetFps = getTargetFps();
      const targetInterval = 1000 / targetFps;
      const elapsed = timestamp - lastFrameTime;

      if (elapsed >= targetInterval - 1) {
        const rawDelta = timestamp - lastDrawTimestamp;
        lastDrawTimestamp = timestamp;
        lastFrameTime = timestamp - (elapsed % targetInterval);
        const dt = Math.min(Math.max(rawDelta / 16.667, 0.2), 2.5);

        const renderStart = performance.now();
        renderFrame(dt);
        const renderCost = performance.now() - renderStart;

        if (!degradedMode) {
          slowFrameWindow.push(renderCost);
          if (slowFrameWindow.length >= 24) {
            const avgCost = slowFrameWindow.reduce((a, b) => a + b, 0) / slowFrameWindow.length;
            slowFrameWindow = [];
            if (avgCost > 14) {
              degradedMode = true;
              const targetCount = computeTargetCount(isMobile(), isLowEndDevice());
              if (particles.length > targetCount) {
                particles.length = targetCount;
              }
            }
          }
        }
      }

      animId = requestAnimationFrame(loop);
    }

    initSize();
    syncMotionClass();
    if (!isAnimationBlocked()) {
      renderFrame(1);
      startLoop();
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    function onMouseMove(e: MouseEvent) {
      pointerX = e.clientX;
      pointerY = e.clientY;
      pointerActive = true;
    }

    function onMouseLeave() {
      pointerActive = false;
      pointerX = -9999;
      pointerY = -9999;
    }

    function onTouchStartOrMove(e: TouchEvent) {
      if (e.touches && e.touches.length > 0) {
        pointerX = e.touches[0].clientX;
        pointerY = e.touches[0].clientY;
        pointerActive = true;
      }
    }

    function onTouchEnd() {
      pointerActive = false;
    }

    let lastTiltTimestamp = 0;
    function onDeviceOrientation(e: DeviceOrientationEvent) {
      if (isAnimationBlocked()) return;
      const now = performance.now();
      if (now - lastTiltTimestamp < 60) return;
      lastTiltTimestamp = now;

      const isLandscape = window.innerWidth > window.innerHeight;
      const rawAxis = isLandscape ? e.beta : e.gamma;
      if (typeof rawAxis !== 'number' || isNaN(rawAxis)) return;

      hasTiltData = true;
      if (Math.abs(rawAxis) <= 2.5) {
        targetTiltX = 0;
        return;
      }
      const clamped = Math.max(-25, Math.min(25, rawAxis));
      targetTiltX = (clamped / 25) * 1.1;
    }

    function onVisibilityChange() {
      if (document.hidden) {
        stopLoop();
      } else {
        startLoop();
      }
    }

    function onResize() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        initSize();
        if (isAnimationBlocked()) {
          ctx?.clearRect(0, 0, width, height);
        } else {
          startLoop();
        }
      }, 150);
    }

    function applyMotionState() {
      syncMotionClass();
      if (reducedMotion || userPaused) {
        stopLoop();
        ctx?.clearRect(0, 0, width, height);
      } else {
        renderFrame(1);
        startLoop();
      }
    }

    function onMotionChange(e: MediaQueryListEvent) {
      reducedMotion = e.matches;
      applyMotionState();
    }

    if (typeof motionQuery.addEventListener === 'function') {
      motionQuery.addEventListener('change', onMotionChange);
    }

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseleave', onMouseLeave, { passive: true });
    window.addEventListener('touchstart', onTouchStartOrMove, { passive: true });
    window.addEventListener('touchmove', onTouchStartOrMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      try {
        window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
      } catch {
        // Sensor unavailable or blocked
      }
    }

    (window as Window & { __noxParticles?: unknown }).__noxParticles = {
      pause() {
        userPaused = true;
        try { localStorage.setItem('nox-tracker-animations-paused', '1'); } catch { /* ignore */ }
        applyMotionState();
      },
      resume() {
        userPaused = false;
        try { localStorage.setItem('nox-tracker-animations-paused', '0'); } catch { /* ignore */ }
        applyMotionState();
      },
      toggle() {
        if (userPaused) this.resume();
        else this.pause();
        return this.isPaused();
      },
      isPaused() {
        return reducedMotion || userPaused;
      },
      getMetrics() {
        return {
          count: particles.length,
          targetFps: getTargetFps(),
          dpr: currentDpr,
          animActive: animId !== null,
          degradedMode,
          hasTiltData,
          pointerActive
        };
      }
    };

    cleanupListeners = () => {
      stopLoop();
      if (resizeTimer) clearTimeout(resizeTimer);
      if (typeof motionQuery.removeEventListener === 'function') {
        motionQuery.removeEventListener('change', onMotionChange);
      }
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('touchstart', onTouchStartOrMove);
      window.removeEventListener('touchmove', onTouchStartOrMove);
      window.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('deviceorientation', onDeviceOrientation);
      delete (window as Window & { __noxParticles?: unknown }).__noxParticles;
    };
  });

  onDestroy(() => {
    if (cleanupListeners) {
      cleanupListeners();
      cleanupListeners = null;
    }
  });
</script>

<div class="particle-system" aria-hidden="true">
  <div class="ambient-mesh"></div>
  <div class="ambient-glow glow-top"></div>
  <div class="ambient-glow glow-side"></div>
  <div class="ambient-glow glow-bottom-left"></div>
  <canvas bind:this={canvas} class="particle-canvas"></canvas>
  <div class="night-vignette"></div>
</div>

<style>
  .particle-system {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
    contain: strict;
    background: linear-gradient(145deg, #090611 0%, #07050d 48%, #0d0916 100%);
  }

  .ambient-mesh {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 52% 38% at 50% 20%, rgba(226, 217, 245, 0.045) 0%, transparent 70%),
      radial-gradient(ellipse 68% 54% at 14% 16%, rgba(103, 51, 168, 0.22) 0%, transparent 65%),
      radial-gradient(ellipse 64% 58% at 86% 24%, rgba(73, 33, 133, 0.24) 0%, transparent 65%),
      radial-gradient(ellipse 75% 60% at 50% 52%, rgba(124, 58, 237, 0.13) 0%, transparent 70%),
      radial-gradient(ellipse 68% 58% at 18% 84%, rgba(92, 43, 154, 0.20) 0%, transparent 65%),
      radial-gradient(ellipse 65% 56% at 85% 88%, rgba(67, 31, 119, 0.20) 0%, transparent 65%);
    pointer-events: none;
  }

  .ambient-glow {
    position: absolute;
    border-radius: 50%;
    opacity: 0.75;
    pointer-events: none;
  }

  .glow-top {
    top: -160px;
    left: 50%;
    transform: translateX(-50%);
    width: min(1000px, 120vw);
    height: 520px;
    background: radial-gradient(ellipse at center, rgba(139, 92, 246, 0.12) 0%, rgba(99, 102, 241, 0.05) 42%, transparent 72%);
  }

  .glow-side {
    top: 28%;
    right: -180px;
    width: 680px;
    height: 680px;
    background: radial-gradient(circle, rgba(147, 51, 234, 0.10) 0%, rgba(79, 70, 229, 0.04) 48%, transparent 74%);
  }

  .glow-bottom-left {
    bottom: -160px;
    left: -140px;
    width: 680px;
    height: 680px;
    background: radial-gradient(circle, rgba(124, 58, 237, 0.10) 0%, rgba(48, 23, 75, 0.05) 52%, transparent 74%);
  }

  .particle-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .night-vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 54%, rgba(4, 3, 9, 0.52) 100%);
    pointer-events: none;
  }

  :global(html.animations-paused) .particle-canvas {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .particle-canvas {
      display: none;
    }
  }
</style>

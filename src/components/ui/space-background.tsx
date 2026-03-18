'use client';

import { useEffect, useMemo, useRef } from 'react';

type Star = {
  x: number;
  y: number;
  r: number;
  baseA: number;
  tw: number;
  hue: number;
};

type Meteor = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  len: number;
  w: number;
  hue: number;
};

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const meteorsRef = useRef<Meteor[]>([]);
  const nextMeteorAtRef = useRef<number>(0);

  const seed = useMemo(() => Math.floor(Math.random() * 1_000_000), []);

  useEffect(() => {
    const maybeCanvas = canvasRef.current as HTMLCanvasElement | null;
    if (!maybeCanvas) return;
    const canvasEl: HTMLCanvasElement = maybeCanvas;
    if (prefersReducedMotion()) return;

    const maybeCtx = canvasEl.getContext('2d', { alpha: true, desynchronized: true });
    if (!maybeCtx) return;
    const ctx = maybeCtx;

    let raf = 0;
    let last = performance.now();

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(window.innerWidth));
      const h = Math.max(1, Math.floor(window.innerHeight));
      canvasEl.width = Math.floor(w * dpr);
      canvasEl.height = Math.floor(h * dpr);
      canvasEl.style.width = `${w}px`;
      canvasEl.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // generate starfield
      const area = w * h;
      const count = Math.round(Math.min(900, Math.max(240, area / 6500)));
      const stars: Star[] = [];
      for (let i = 0; i < count; i++) {
        const r = rand(0.25, 1.35) + (Math.random() < 0.04 ? rand(0.8, 1.8) : 0);
        const baseA = rand(0.12, 0.9) * (r < 0.8 ? 0.7 : 1);
        const tw = rand(0.6, 2.2);
        const hue = rand(200, 235);
        stars.push({
          x: rand(0, w),
          y: rand(0, h),
          r,
          baseA,
          tw,
          hue,
        });
      }
      starsRef.current = stars;
      meteorsRef.current = [];
      nextMeteorAtRef.current = performance.now() + rand(900, 2600);
    }

    function spawnMeteor(w: number, h: number) {
      const fromLeft = Math.random() < 0.6;
      const x = fromLeft ? rand(-w * 0.2, w * 0.3) : rand(w * 0.6, w * 1.2);
      const y = rand(-h * 0.15, h * 0.25);
      const speed = rand(900, 1400);
      const angle = rand(0.62, 0.85); // ~35-50deg
      const vx = Math.cos(angle) * speed * (fromLeft ? 1 : -1);
      const vy = Math.sin(angle) * speed;
      const maxLife = rand(0.55, 0.9);
      meteorsRef.current.push({
        x,
        y,
        vx,
        vy,
        life: 0,
        maxLife,
        len: rand(260, 520),
        w: rand(1.0, 2.2),
        hue: rand(205, 225),
      });
    }

    function draw(t: number) {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;

      const w = window.innerWidth;
      const h = window.innerHeight;

      // clear (transparent; body gradient stays)
      ctx.clearRect(0, 0, w, h);

      // subtle nebula glow (procedural gradients)
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      const g1 = ctx.createRadialGradient(w * 0.7, h * 0.2, 0, w * 0.7, h * 0.2, Math.max(w, h) * 0.55);
      g1.addColorStop(0, 'rgba(56,146,255,0.10)');
      g1.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);
      const g2 = ctx.createRadialGradient(w * 0.2, h * 0.8, 0, w * 0.2, h * 0.8, Math.max(w, h) * 0.6);
      g2.addColorStop(0, 'rgba(255,255,255,0.05)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // stars
      const stars = starsRef.current;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const twinkle = 0.55 + 0.45 * Math.sin((t / 1000) * s.tw + (seed % 1000));
        const a = Math.min(1, s.baseA * twinkle);
        ctx.globalAlpha = a;
        ctx.fillStyle = `hsla(${s.hue}, 80%, 92%, 1)`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // meteors
      if (t >= nextMeteorAtRef.current) {
        spawnMeteor(w, h);
        nextMeteorAtRef.current = t + rand(1400, 3600);
      }

      const meteors = meteorsRef.current;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.life += dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;

        const p = Math.min(1, m.life / m.maxLife);
        const fadeIn = Math.min(1, p / 0.18);
        const fadeOut = 1 - Math.max(0, (p - 0.65) / 0.35);
        const alpha = 0.75 * fadeIn * fadeOut;

        const dx = -m.vx;
        const dy = -m.vy;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const x2 = m.x + ux * m.len;
        const y2 = m.y + uy * m.len;

        const grad = ctx.createLinearGradient(m.x, m.y, x2, y2);
        grad.addColorStop(0, `hsla(${m.hue}, 90%, 85%, ${alpha})`);
        grad.addColorStop(0.12, `hsla(${m.hue}, 95%, 78%, ${alpha * 0.85})`);
        grad.addColorStop(0.55, `hsla(${m.hue}, 95%, 70%, ${alpha * 0.25})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.lineWidth = m.w;
        ctx.strokeStyle = grad;
        ctx.globalAlpha = 1;
        ctx.shadowColor = `hsla(${m.hue}, 95%, 70%, ${alpha})`;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // head sparkle
        ctx.shadowBlur = 26;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `hsla(${m.hue}, 95%, 90%, 1)`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, Math.max(1.2, m.w * 1.15), 0, Math.PI * 2);
        ctx.fill();

        if (p >= 1 || m.y > h + 200 || m.x < -400 || m.x > w + 400) {
          meteors.splice(i, 1);
        }
      }
      ctx.restore();

      raf = requestAnimationFrame(draw);
    }

    const onResize = () => resize();
    window.addEventListener('resize', onResize, { passive: true });
    resize();
    raf = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  }, [seed]);

  return (
    <div className="space-bg" aria-hidden="true">
      <canvas ref={canvasRef} className="space-bg-canvas" />
      <div className="space-bg-gloss" />
      <div className="space-bg-vignette" />
    </div>
  );
}

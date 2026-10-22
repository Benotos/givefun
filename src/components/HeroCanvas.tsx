"use client";

import { useEffect, useRef } from "react";

// Rising embers and hearts. Sprites are prerendered once, the loop only blits them.
// Pauses when off screen or the tab is hidden. Renders one still frame for reduced motion.

type P = { x: number; y: number; r: number; v: number; sway: number; ph: number; a: number; spr: number; heart: boolean; depth: number };

const COLORS: [string, string][] = [
  ["255,106,69", "255,106,69"],
  ["255,199,102", "255,170,60"],
  ["255,138,161", "255,106,69"],
];

function sprite(rgb: string, size = 64): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, `rgba(${rgb},0.95)`);
  grd.addColorStop(0.25, `rgba(${rgb},0.55)`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

function heartPath(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s, -s * 0.2, -s * 0.5, -s, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.5, -s, s, -s * 0.2, 0, s * 0.35);
  ctx.closePath();
}

export default function HeroCanvas({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sprites = COLORS.map(([c]) => sprite(c));
    let w = 0, h = 0, raf = 0, last = 0, visible = true, tabOn = !document.hidden;
    let px = 0, py = 0, tx = 0, ty = 0;
    let ps: P[] = [];

    const spawn = (initial: boolean): P => {
      const depth = 0.4 + Math.random() * 0.9;
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : h + 20 + Math.random() * 60,
        r: (6 + Math.random() * 22) * depth,
        v: (10 + Math.random() * 26) * depth,
        sway: 6 + Math.random() * 22,
        ph: Math.random() * Math.PI * 2,
        a: 0.25 + Math.random() * 0.55,
        spr: Math.floor(Math.random() * sprites.length),
        heart: Math.random() < 0.16,
        depth,
      };
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(70, Math.max(22, w / 20)));
      ps = Array.from({ length: n }, () => spawn(true));
      draw(0);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      px += (tx - px) * 0.05;
      py += (ty - py) * 0.05;
      for (const p of ps) {
        const x = p.x + Math.sin(t / 1800 + p.ph) * p.sway + px * p.depth * 30;
        const y = p.y + py * p.depth * 20;
        const edge = Math.min(1, y / (h * 0.25), (h - y + 40) / (h * 0.2));
        const alpha = p.a * Math.max(0, Math.min(1, edge));
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        if (p.heart) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(t / 1400 + p.ph) * 0.35);
          ctx.fillStyle = "rgba(255,138,161,0.9)";
          heartPath(ctx, p.r * 0.55);
          ctx.fill();
          ctx.restore();
        } else {
          const s = sprites[p.spr];
          ctx.drawImage(s, x - p.r, y - p.r, p.r * 2, p.r * 2);
        }
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      raf = 0;
      if (!visible || !tabOn) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      for (const p of ps) {
        p.y -= p.v * dt;
        if (p.y < -40) Object.assign(p, spawn(false));
      }
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (reduce || raf || !visible || !tabOn) return;
      last = 0;
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
    };
    const onVis = () => {
      tabOn = !document.hidden;
      if (tabOn) start();
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    document.addEventListener("visibilitychange", onVis);
    if (!reduce) window.addEventListener("pointermove", onMove, { passive: true });

    resize();
    start();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden="true" />;
}

"use client";

import { useEffect, useRef, useState } from "react";

// Animated number. Counts up the first time it scrolls into view, and tweens smoothly on every change.
export default function Counter({
  value,
  decimals = 0,
  duration = 1400,
  className = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  const cur = useRef(value);
  const raf = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tween = (from: number, to: number, ms: number) => {
      cancelAnimationFrame(raf.current);
      if (reduce || from === to) {
        cur.current = to;
        setShown(to);
        return;
      }
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - p, 3);
        const v = from + (to - from) * e;
        cur.current = v;
        setShown(v);
        if (p < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    };

    if (first.current) {
      first.current = false;
      const el = ref.current;
      if (!el || typeof IntersectionObserver === "undefined") {
        tween(0, value, duration);
        return;
      }
      setShown(0);
      cur.current = 0;
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            tween(0, value, duration);
          }
        },
        { threshold: 0.3 },
      );
      io.observe(el);
      return () => {
        io.disconnect();
        cancelAnimationFrame(raf.current);
      };
    }
    tween(cur.current, value, 900);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {shown.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

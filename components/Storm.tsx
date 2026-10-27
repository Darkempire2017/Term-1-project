'use client';

import { useEffect, useRef } from 'react';

// Shared pieces of the rainy blue theme (welcome screen, page headers).

type Intensity = 'storm' | 'light';

// Slanted rain streaks drawn on a canvas that fills its positioned parent.
// "storm" is the heavy welcome-screen rain with splashes; "light" is for headers.
export function RainCanvas({ intensity = 'light', className = '' }: { intensity?: Intensity; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const heavy = intensity === 'storm';
    const areaPerDrop = heavy ? 1400 : 2200;

    type Drop = { x: number; y: number; len: number; speed: number; width: number; alpha: number };
    type Splash = { x: number; y: number; r: number; a: number };
    let drops: Drop[] = [];
    let splashes: Splash[] = [];
    let W = 0;
    let H = 0;
    let frame = 0;

    const newDrop = (anywhere: boolean): Drop => {
      const z = Math.random(); // depth: far drops are thin, slow and faint
      return {
        x: Math.random() * (W + 60) - 30,
        y: anywhere ? Math.random() * H : -20 - Math.random() * 80,
        len: heavy ? 12 + z * 22 : 10 + z * 18,
        speed: heavy ? 9 + z * 11 : 6 + z * 8,
        width: heavy ? 0.6 + z * 1.1 : 0.6 + z,
        alpha: heavy ? 0.15 + z * 0.35 : 0.1 + z * 0.3,
      };
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drops = Array.from({ length: Math.round((W * H) / areaPerDrop) }, () => newDrop(true));
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round';
      for (const d of drops) {
        ctx.strokeStyle = `rgba(200, 220, 255, ${d.alpha})`;
        ctx.lineWidth = d.width;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * 0.18, d.y + d.len);
        ctx.stroke();
        d.y += d.speed;
        d.x -= d.speed * 0.18;
        if (d.y > H - 6) {
          if (heavy && d.alpha > 0.3) splashes.push({ x: d.x, y: H - 4, r: 0, a: 0.5 });
          Object.assign(d, newDrop(false));
        }
      }
      splashes = splashes.filter((s) => s.a > 0.02);
      for (const s of splashes) {
        ctx.strokeStyle = `rgba(200, 220, 255, ${s.a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.r * 2.2, s.r * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
        s.r += 0.5;
        s.a *= 0.9;
      }
      frame = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [intensity]);

  return <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full ${className}`} aria-hidden="true" />;
}

// Outline cloud with three drops dripping from it.
export function CloudMark({ className = 'w-16 h-16' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      stroke="#fff"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d="M28 58 H72 A13 13 0 0 0 72 32 A20 20 0 0 0 35 29 A15 15 0 0 0 28 58 Z"
        fill="rgba(255,255,255,.12)"
      />
      <g stroke="#94b0ea">
        <path className="animate-drip opacity-0" d="M38 66 l-2 7" />
        <path className="animate-drip opacity-0 [animation-delay:.35s]" d="M52 66 l-2 7" />
        <path className="animate-drip opacity-0 [animation-delay:.7s]" d="M66 66 l-2 7" />
      </g>
    </svg>
  );
}

// Blue gradient page header. Rain is only for the sign-in page (and dashboard).
export function StormHeader({
  children,
  className = '',
  rain = false,
}: {
  children: React.ReactNode;
  className?: string;
  rain?: boolean;
}) {
  return (
    <section className={`relative bg-storm text-white overflow-hidden ${className}`}>
      {rain && <RainCanvas />}
      <div className="relative">{children}</div>
    </section>
  );
}

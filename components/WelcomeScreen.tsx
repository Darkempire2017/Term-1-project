'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './WelcomeScreen.module.css';

const LINES = ['Caught In', 'Rain ?'];
const STAY_MS = 2000;  // time on screen before the exit starts
const LEAVE_MS = 950;  // exit: letters drip out, then the screen rolls up

// Slanted rain streaks with small splashes at the bottom, drawn on a canvas.
function useRain(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

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
        len: 12 + z * 22,
        speed: 9 + z * 11,
        width: 0.6 + z * 1.1,
        alpha: 0.15 + z * 0.35,
      };
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drops = Array.from({ length: Math.round((W * H) / 1400) }, () => newDrop(true));
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
          if (d.alpha > 0.3) splashes.push({ x: d.x, y: H - 4, r: 0, a: 0.5 });
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
  }, [canvasRef]);
}

// Animated welcome shown when the site opens, then hands over to sign-in.
export default function WelcomeScreen({ next = '/login' }: { next?: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [leaving, setLeaving] = useState(false);
  useRain(canvasRef);

  useEffect(() => {
    router.prefetch(next);
    const leave = setTimeout(() => setLeaving(true), STAY_MS);
    const go = setTimeout(() => router.replace(next), STAY_MS + LEAVE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(go);
    };
  }, [router, next]);

  let i = 0; // running letter index, staggers the per-letter animation

  return (
    <div className={`${styles.welcome} ${leaving ? styles.leave : styles.play}`}>
      <canvas ref={canvasRef} className={styles.rain} aria-hidden="true" />
      <div className={styles.flash} />

      <div className={styles.content}>
        <svg
          className={styles.icon}
          viewBox="0 0 100 100"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path
            className={styles.cloud}
            d="M28 58 H72 A13 13 0 0 0 72 32 A20 20 0 0 0 35 29 A15 15 0 0 0 28 58 Z"
            fill="rgba(255,255,255,.12)"
          />
          <g stroke="#94b0ea">
            <path className={styles.drop} d="M38 66 l-2 7" />
            <path className={styles.drop} d="M52 66 l-2 7" />
            <path className={styles.drop} d="M66 66 l-2 7" />
          </g>
        </svg>

        {/* Two fixed lines so "?" never wraps on its own on narrow phones */}
        <h1 className={styles.title} aria-label={LINES.join(' ')}>
          {LINES.map((line, li) => (
            <span key={line} aria-hidden="true">
              {li > 0 && <br />}
              <span className={styles.word}>
                {[...line].map((c) => (
                  <span
                    key={i}
                    className={`${styles.ch} ${c === '?' ? styles.q : ''}`}
                    style={{ '--i': i++ } as React.CSSProperties}
                  >
                    {c === ' ' ? ' ' : c}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </h1>
        <p className={styles.tag}>Grab an umbrella in seconds.</p>
      </div>

      <div className={styles.brand}>ASTRIX</div>
    </div>
  );
}

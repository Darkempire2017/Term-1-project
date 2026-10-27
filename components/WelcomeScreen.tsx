'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RainCanvas } from './Storm';
import styles from './WelcomeScreen.module.css';

const LINES = ['Caught In', 'Rain ?'];
const STAY_MS = 2000;  // time on screen before the exit starts
const LEAVE_MS = 950;  // exit: letters drip out, then the screen rolls up

// Animated welcome shown when the site opens, then hands over to sign-in.
export default function WelcomeScreen({ next = '/login' }: { next?: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

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
      <RainCanvas intensity="storm" />
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

import crypto from 'crypto';

/**
 * Generate a 6-digit one-time code with a cryptographically secure RNG
 */
export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Constant-time string comparison (avoids leaking how many characters matched)
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

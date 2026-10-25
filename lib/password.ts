import crypto from 'crypto';

/**
 * Hash a plain password using Node.js crypto scrypt with a unique random salt.
 * Format: `<salt_hex>:<hash_hex>`
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password.trim(), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * True for passwords stored before hashing was added (no `salt:hash` format)
 */
export function isLegacyPlaintext(storedHash: string): boolean {
  return !storedHash.includes(':');
}

/**
 * Verify a plain password against a stored salt:hash string using timing-safe comparison.
 * Legacy plaintext rows are compared in constant time; the login route re-hashes them
 * on the first successful sign-in.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;

  if (isLegacyPlaintext(storedHash)) {
    const a = Buffer.from(password.trim(), 'utf8');
    const b = Buffer.from(storedHash.trim(), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;

  try {
    const checkHash = crypto.scryptSync(password.trim(), salt, 64).toString('hex');
    const hashBuffer = Buffer.from(hash, 'hex');
    const checkBuffer = Buffer.from(checkHash, 'hex');

    if (hashBuffer.length !== checkBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(hashBuffer, checkBuffer);
  } catch {
    return false;
  }
}

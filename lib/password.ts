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
 * Verify a plain password against a stored salt:hash string using timing-safe comparison.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;

  // Backward compatibility in case of legacy plaintext
  if (!storedHash.includes(':')) {
    return password.trim() === storedHash.trim();
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

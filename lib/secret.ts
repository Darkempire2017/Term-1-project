/**
 * Signing secret for session cookies and signup verification tokens.
 * Set AUTH_SECRET to a long random string (e.g. `openssl rand -hex 32`).
 * There is deliberately no fallback: without it, signing fails closed.
 */
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET is not set (or shorter than 32 characters).');
  }
  return secret;
}

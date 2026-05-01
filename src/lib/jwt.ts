import jwt from 'jsonwebtoken';
import { decrypt, encrypt } from '@/lib/crypto';

export function createToken(payload: any, secret: any, options?: any) {
  return jwt.sign(payload, secret, options);
}

export function parseToken(token: string, secret: any) {
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

export function createSecureToken(payload: any, secret: any, options?: any) {
  return encrypt(createToken(payload, secret, options), secret);
}

// jsonwebtoken's verify is ~380µs/call, dominated by JWS HMAC re-derivation.
// parseSecureToken runs on every authenticated request and the same bearer
// token recurs across all of them; cache the verified payload. Cache value
// is null for tokens that fail verification (still a valid result; bounded
// negative caching avoids re-paying ~380µs on every call from an attacker
// or stale client). LRU bounded; tokens have no exp so cache never goes
// stale on its own.
const TOKEN_CACHE_LIMIT = 2048;
const tokenCache = new Map<string, any>();

export function parseSecureToken(token: string, secret: any) {
  if (!token) return null;

  const cached = tokenCache.get(token);
  if (cached !== undefined) {
    tokenCache.delete(token);
    tokenCache.set(token, cached);
    return cached;
  }

  let result: any;
  try {
    result = jwt.verify(decrypt(token, secret), secret);
  } catch {
    result = null;
  }

  if (tokenCache.size >= TOKEN_CACHE_LIMIT) {
    const oldest = tokenCache.keys().next().value;
    if (oldest !== undefined) tokenCache.delete(oldest);
  }
  tokenCache.set(token, result);
  return result;
}

export async function parseAuthToken(req: Request, secret: string) {
  try {
    const token = req.headers.get('authorization')?.split(' ')?.[1];

    return parseSecureToken(token as string, secret);
  } catch {
    return null;
  }
}

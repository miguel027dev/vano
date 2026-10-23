import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const hex = (n = 32) => randomBytes(n).toString('hex');
export const sha256 = input => createHash('sha256').update(String(input)).digest('hex');
export const sign = (secret, message) => createHmac('sha256', secret).update(message).digest('base64url');
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export const isEmail = email => typeof email === 'string' && email.length <= 180 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
export const validPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 128 && !/[\u0000-\u001f]/.test(value);
export const validName = value => typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 80 && !/[\u0000-\u001f\u007f]/.test(value);
export const cleanText = (value, length = 200) => typeof value === 'string' ? value.trim().slice(0, length).replace(/[\u0000-\u001f\u007f]/g, '') : '';
export const reportPublic = rec => ({
  id: rec.id, type: rec.type, description: cleanText(rec.description, 280),
  // Approximate incident locations: never ship the author's identity or precise coordinates.
  coords: Array.isArray(rec.coords) ? rec.coords.map(n => Number(Number(n).toFixed(3))) : null,
  createdAt: rec.createdAt, status: rec.status,
});

export function createLimiter() {
  const items = new Map();
  let lastSweep = 0;
  return (key, max, windowMs = 60000) => {
    const now = Date.now();
    if (now - lastSweep > 60000) {
      for (const [k, v] of items) if (v.until <= now) items.delete(k);
      lastSweep = now;
      if (items.size > 120000) items.clear();
    }
    let val = items.get(key);
    if (!val || val.until <= now) val = { count: 0, until: now + windowMs };
    val.count++;
    items.set(key, val);
    return { allowed: val.count <= max, retryAfter: Math.ceil((val.until - now) / 1000) };
  };
}

export function signedToken(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(secret, body)}`;
}
export function openSignedToken(secret, token) {
  if (typeof token !== 'string' || token.length > 6000) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra || !safeEqual(sign(secret, body), sig)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
}
export function csrfToken(secret, subject) { return sign(secret, `csrf:${subject}`); }
export function correctOrigin(req, configuredOrigin = '', additionalOrigins = []) {
  const origin = req.headers.origin;
  if (!origin) return req.headers['sec-fetch-site'] !== 'cross-site';
  try {
    const expected = configuredOrigin ? new URL(configuredOrigin).origin : `http://${req.headers.host}`;
    // Aliases are explicitly configured; never trust Host, forwarded headers or a wildcard in production.
    const allowed = origin === expected || (configuredOrigin && additionalOrigins.includes(origin)) || (!configuredOrigin && origin === `https://${req.headers.host}`);
    return allowed && req.headers['sec-fetch-site'] !== 'cross-site';
  } catch { return false; }
}
export function secureHeaders(production = false) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    // Send only the origin to Mapbox. Browser URL-restricted pk tokens require Referer.
    // Do not leak query strings / full paths to other origins.
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(self), payment=(), geolocation=(self)',
    'X-Permitted-Cross-Domain-Policies': 'none',
  };
  if (production) {
    headers['Strict-Transport-Security'] = 'max-age=15552000';
    headers['Content-Security-Policy'] = [
      "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
      "form-action 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.mapbox.com https://server.arcgisonline.com https://upload.wikimedia.org https://openrouter.ai", "font-src 'self' data: https://fonts.gstatic.com",
      "worker-src 'self' blob:", "media-src 'self' blob:", "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.mapbox.com",
      "upgrade-insecure-requests",
    ].join('; ');
  }
  return headers;
}

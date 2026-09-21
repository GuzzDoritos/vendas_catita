import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'catita_session';
export const SESSION_SECONDS = 60 * 60 * 24 * 30;

export function authConfig() {
  const password = process.env.APP_PASSWORD ?? '';
  const secret = process.env.SESSION_SECRET ?? '';
  if (password.length < 12 || secret.length < 32) throw new Error('AUTH_CONFIGURATION');
  return { password, secret };
}

export function passwordMatches(candidate: string, expected: string) {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}

function signature(payload: string, password: string, secret: string) {
  // Rotating either the password or the secret invalidates all existing sessions.
  return createHmac('sha256', secret).update(password).update('\0').update(payload).digest('base64url');
}

export function createSession(password: string, secret: string, now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(24).toString('base64url')}`;
  return `${payload}.${signature(payload, password, secret)}`;
}

export function validSession(token: string, password: string, secret: string, now = Date.now()) {
  if (token.length > 200) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[\w-]{32}$/.test(parts[1])) return false;
  const expires = Number(parts[0]);
  const seconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expires) || expires <= seconds || expires > seconds + SESSION_SECONDS) return false;
  const expected = signature(`${parts[0]}.${parts[1]}`, password, secret);
  return /^[\w-]{43}$/.test(parts[2]) && timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]));
}

export function sessionFromCookie(header: string | undefined) {
  return (header ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) ?? '';
}

export function sessionCookie(token: string, secure: boolean) {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? SESSION_SECONDS : 0}${secure ? '; Secure' : ''}`;
}

export function sameOrigin(origin: string | undefined, host: string | undefined, secure: boolean) {
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return url.origin === `${secure ? 'https' : 'http'}://${host}`;
  } catch { return false; }
}

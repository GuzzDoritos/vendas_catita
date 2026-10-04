import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import handler from '../api/index.ts';
import { createSession } from '../server/auth.ts';

// Auth and validation tests run without database access. No valid writes are sent.
test('HTTP API protects data and validates writes before accessing the database', async () => {
  const old = { ...process.env };
  process.env.APP_PASSWORD = 'temporary-api-test-password';
  process.env.SESSION_SECRET = 's'.repeat(64);
  process.env.NODE_ENV = 'test';
  delete process.env.VERCEL;
  delete process.env.DATABASE_URL;
  const server = createServer((req, res) => { void handler(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const cookie = `catita_session=${createSession(process.env.APP_PASSWORD, process.env.SESSION_SECRET)}`;
  const send = (action: string, method = 'GET', body?: unknown, authenticated = false, site = origin) => fetch(`${origin}/api?action=${action}`, {
    method, headers: { Origin: site, 'Content-Type': 'application/json', ...(authenticated ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    assert.equal((await send('data')).status, 401);
    assert.equal((await send('data', 'PUT', {})).status, 401);
    assert.equal((await send('data', 'PUT', {}, true, 'https://evil.example')).status, 403);
    assert.equal((await send('login', 'POST', { password: 'x' }, false, 'https://evil.example')).status, 403);
    assert.deepEqual(await (await send('session')).json(), { authenticated: false });
    assert.deepEqual(await (await send('session', 'GET', undefined, true)).json(), { authenticated: true });
    assert.equal((await send('data', 'PUT', { revision: -1, data: { version: 2 } }, true)).status, 400);
    assert.equal((await send('data', 'PUT', { revision: 0, data: { version: 1, months: {} } }, true)).status, 409);
    assert.equal((await send('data', 'PUT', { revision: 0, data: { version: 2, months: [] } }, true)).status, 400);
    const unavailable = await send('data', 'GET', undefined, true);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get('cache-control'), 'no-store');
    assert.ok(!(await unavailable.text()).includes(process.env.SESSION_SECRET));
    const logout = await send('logout', 'POST', {}, true);
    assert.equal(logout.status, 200);
    assert.ok(logout.headers.get('set-cookie')?.includes('Max-Age=0'));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    process.env = old;
  }
});

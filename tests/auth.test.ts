import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, passwordMatches, sameOrigin, sessionCookie, sessionFromCookie, SESSION_SECONDS, validSession } from '../server/auth.ts';

const password = 'test-password-for-unit-tests';
const secret = 'a'.repeat(64);
const now = 1_800_000_000_000;

test('session is signed, expires and is invalidated by rotating either secret', () => {
  const token = createSession(password, secret, now);
  assert.ok(validSession(token, password, secret, now));
  assert.ok(!validSession(token, password, secret, now + SESSION_SECONDS * 1000));
  assert.ok(!validSession(token, password + 'x', secret, now));
  assert.ok(!validSession(token, password, secret + 'x', now));
  assert.ok(!validSession(token.replace(/^./, '9'), password, secret, now));
  assert.notEqual(createSession(password, secret, now), token);
});

test('malformed tokens are rejected without throwing', () => {
  for (const token of ['', '...', '1.foo.bar', 'a'.repeat(1000), 'Infinity.a.b']) assert.equal(validSession(token, password, secret, now), false);
});

test('password comparison and cookie properties', () => {
  assert.ok(passwordMatches(password, password));
  assert.ok(!passwordMatches('', password));
  const cookie = sessionCookie('token', true);
  for (const flag of ['HttpOnly', 'SameSite=Strict', 'Path=/', 'Secure']) assert.ok(cookie.includes(flag));
  assert.ok(sessionCookie('', true).includes('Max-Age=0'));
  assert.ok(!sessionCookie('token', false).includes('Secure'));
  assert.equal(sessionFromCookie('other=1; catita_session=abc; x=3'), 'abc');
});

test('cross-site writes and missing origins are rejected', () => {
  assert.ok(sameOrigin('https://catita.example', 'catita.example', true));
  assert.ok(sameOrigin('http://localhost:5173', 'localhost:5173', false));
  assert.ok(!sameOrigin('https://evil.example', 'catita.example', true));
  assert.ok(!sameOrigin('http://catita.example', 'catita.example', true));
  assert.ok(!sameOrigin(undefined, 'catita.example', true));
  assert.ok(!sameOrigin('null', 'catita.example', true));
});

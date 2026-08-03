'use strict';

/**
 * Signed sessions — must survive process restart (Render redeploy / sleep).
 */

const assert = require('assert');
const { createSessionStore, SESSION_TTL_MS } = require('./auth/sessions');

function ok(msg) {
  console.log('  ok  —', msg);
}

function user() {
  return {
    username: 'jois',
    displayName: 'Jois',
    profile: 2,
    userSheet: 'user-03',
    employeeId: '3109',
  };
}

try {
  assert.ok(SESSION_TTL_MS > 0);

  const a = createSessionStore({ secret: 'unit-secret-alpha' });
  const out = a.create(user());
  assert.ok(out.token && out.token.indexOf('.') > 0, 'token is signed (body.sig)');
  assert.ok(out.csrfToken);
  assert.strictEqual(out.user.username, 'jois');

  const live = a.get(out.token);
  assert.ok(live);
  assert.strictEqual(live.username, 'jois');
  assert.strictEqual(live.csrfToken, out.csrfToken);
  ok('create + get in same process');

  // Simulate Render restart: brand-new Map, same SESSION_SECRET
  const b = createSessionStore({ secret: 'unit-secret-alpha' });
  const resumed = b.get(out.token);
  assert.ok(resumed, 'HMAC verify rebuilds session without in-memory Map');
  assert.strictEqual(resumed.username, 'jois');
  assert.strictEqual(resumed.displayName, 'Jois');
  assert.strictEqual(resumed.profile, 2);
  assert.strictEqual(resumed.userSheet, 'user-03');
  assert.strictEqual(resumed.csrfToken, out.csrfToken);
  ok('session survives store recreate (Render restart)');

  const wrong = createSessionStore({ secret: 'unit-secret-other' }).get(out.token);
  assert.strictEqual(wrong, null);
  ok('wrong SESSION_SECRET rejects token');

  assert.strictEqual(b.get(''), null);
  assert.strictEqual(b.get('not-a-token'), null);
  assert.strictEqual(b.get('aaa.bbb'), null);
  ok('garbage tokens rejected');

  b.destroy(out.token);
  // Signed tokens cannot be revoked after destroy without a denylist —
  // destroy only clears the hot cache; verify still rebuilds until exp.
  const still = b.get(out.token);
  assert.ok(still, 'signed token still verifies after cache destroy (TTL is the revoke)');
  ok('destroy clears cache only; HMAC still valid until expiry');

  console.log('\n1 passed block, sessions signed restart-safe');
} catch (e) {
  console.error('FAIL sessions', e);
  process.exit(1);
}

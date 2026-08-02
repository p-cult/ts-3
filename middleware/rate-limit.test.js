'use strict';

const assert = require('assert');
const { createRateLimiter, clientIp } = require('./http/rate-limit');
const { safeEqual } = require('./use-cases/login');

function ok(msg) {
  console.log('  ok  —', msg);
}

try {
  const r = createRateLimiter({ windowMs: 60000 });
  assert.strictEqual(r.underLimit('t', 2), true);
  assert.strictEqual(r.underLimit('t', 2), true);
  assert.strictEqual(r.underLimit('t', 2), false);
  r.stop();
  ok('rate limiter blocks after max');
} catch (e) {
  console.error('FAIL rate limiter', e);
  process.exit(1);
}

try {
  assert.strictEqual(safeEqual('abc', 'abc'), true);
  assert.strictEqual(safeEqual('abc', 'abd'), false);
  assert.strictEqual(safeEqual('abc', 'ab'), false);
  assert.strictEqual(safeEqual('', ''), false);
  ok('safeEqual timing-safe password compare');
} catch (e) {
  console.error('FAIL safeEqual', e);
  process.exit(1);
}

try {
  const ip = clientIp({
    headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    socket: { remoteAddress: '127.0.0.1' },
  });
  assert.strictEqual(ip, '1.2.3.4');
  ok('clientIp prefers x-forwarded-for');
} catch (e) {
  console.error('FAIL clientIp', e);
  process.exit(1);
}

console.log('rate-limit / login helpers: passed');

'use strict';

/**
 * Slice 11 — Hosting split (CORS).
 */

const assert = require('assert');
const http = require('http');
const { startServer } = require('./server');
const { config: baseConfig } = require('./config');

let passed = 0;
let failed = 0;
function ok(n) {
  passed += 1;
  console.log('  ok  — ' + n);
}
function fail(n, e) {
  failed += 1;
  console.error('  FAIL — ' + n, e && e.message ? e.message : e);
}

function request(port, method, pathName, { origin, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (origin) headers.Origin = origin;
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: '127.0.0.1', port, path: pathName, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            raw: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function getHealth(port) {
  return new Promise((resolve, reject) => {
    http
      .get({ hostname: '127.0.0.1', port, path: '/api/health' }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        });
      })
      .on('error', reject);
  });
}

async function main() {
  console.log('slice 11 tests\n');

  try {
    const healthOnly = await startServer({ host: '127.0.0.1', port: 0 });
    const hp = healthOnly.address().port;
    const healthReq = await getHealth(hp);
    assert.strictEqual(healthReq.slice, '15');
    ok('health slice 11');
    await new Promise((r) => healthOnly.close(r));
  } catch (e) {
    fail('health slice 11', e);
  }

  const allowed = 'https://pages.example.test';
  const server = await startServer({
    host: '127.0.0.1',
    port: 0,
    config: { ...baseConfig, corsOrigin: allowed },
  });
  const port = server.address().port;

  try {
    const h = await request(port, 'GET', '/api/health', { origin: allowed });
    assert.strictEqual(h.status, 200);
    assert.strictEqual(h.headers['access-control-allow-origin'], allowed);
    ok('CORS header on GET when CORS_ORIGIN set');

    const opt = await request(port, 'OPTIONS', '/api/tasks', { origin: allowed });
    assert.strictEqual(opt.status, 204);
    assert.strictEqual(opt.headers['access-control-allow-origin'], allowed);
    ok('OPTIONS preflight returns 204 + CORS');

    const noCors = await startServer({ host: '127.0.0.1', port: 0 });
    const p2 = noCors.address().port;
    const plain = await request(p2, 'GET', '/api/health');
    assert.strictEqual(plain.headers['access-control-allow-origin'], undefined);
    ok('no CORS header when CORS_ORIGIN unset');
    await new Promise((r) => noCors.close(r));

    const login = await request(port, 'POST', '/api/login', {
      origin: allowed,
      body: { username: 'ts3admin', password: 'ts3-98860' },
    });
    assert.strictEqual(login.status, 200);
    const setCookie = String(login.headers['set-cookie'] || '');
    assert.ok(/SameSite=None/i.test(setCookie), setCookie);
    assert.ok(/Secure/i.test(setCookie), setCookie);
    ok('login cookie SameSite=None; Secure when CORS_ORIGIN set');
  } catch (e) {
    fail('CORS', e);
  } finally {
    await new Promise((r) => server.close(r));
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

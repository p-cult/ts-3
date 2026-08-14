'use strict';

/**
 * Slice 09 — Dropdown + status vocabulary.
 */

const assert = require('assert');
const http = require('http');
const { startServer } = require('./server');
const { ALL_STATUSES } = require('./domain/roles');

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

function request(port, method, pathName, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = http.request(
      { hostname: '127.0.0.1', port, path: pathName, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            /* */
          }
          resolve({ status: res.statusCode, json, raw });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('slice 09 tests\n');

  const server = await startServer({ host: '127.0.0.1', port: 0 });
  const port = server.address().port;

  try {
    const h = await request(port, 'GET', '/api/health');
    assert.strictEqual(h.json.slice, '15');
    ok('health slice 09');

    const r = await request(port, 'GET', '/api/dropdown-data');
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.json.people));
    assert.strictEqual(r.json.people.length, 0);
    assert.strictEqual(r.json.projects.length, 0);
    assert.strictEqual(r.json.statuses.length, 0);
    ok('dropdown-data anonymous: empty vocabulary');

    const login = await request(port, 'POST', '/api/login', {
      body: { username: 'ts3admin', password: 'ts3-98860' },
    });
    assert.strictEqual(login.status, 200);
    const token = login.json.token;
    const authed = await request(port, 'GET', '/api/dropdown-data', { token });
    assert.strictEqual(authed.status, 200);
    assert.ok(authed.json.people.some((p) => p.username === 'ts3admin'));
    assert.ok(authed.json.projects.some((p) => p.code === 'PRJ001'));
    assert.deepStrictEqual(authed.json.statuses, ALL_STATUSES.slice());
    ok('dropdown-data authenticated includes people projects statuses');
  } catch (e) {
    fail('dropdown-data', e);
  } finally {
    await new Promise((res) => server.close(res));
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
